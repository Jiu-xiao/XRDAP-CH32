// SPDX-License-Identifier: Apache-2.0
// Tests of web/dfu.js against a simulated DFU device: node --test web/test/
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  Dfu, DfuError, DownloadInterrupted, State, boardOfProduct, classifyFile,
  decodeStringDescriptor, downloadWithRetry, imageVersion, parseConfig, readDfuInterfaces,
  transferSizeFromConfig, versionOfProduct,
} from "../dfu.js";

// A DFU interface as the CH32 bootloader runs it: DNLOAD -> DNLOAD-SYNC, GETSTATUS ->
// DNBUSY (once) -> DNLOAD-IDLE; the empty DNLOAD -> MANIFEST-SYNC -> MANIFEST ->
// `manifestEnd`. `dropAt` puts the interface back to dfuIDLE when that block arrives
// (once), as the bootloader did when a block was lost.
class FakeDevice {
  constructor({ manifestEnd = State.MANIFEST_WAIT_RESET, dropAt = -1, errorAt = -1 } = {}) {
    this.opened = false;
    this.configuration = null;
    this.state = State.IDLE;
    this.status = 0;
    this.received = [];
    this.manifestEnd = manifestEnd;
    this.dropAt = dropAt;
    this.errorAt = errorAt;
    this.busyOnce = false;
    this.gone = false;
    this.claimed = new Set();
  }
  async open() { this.opened = true; }
  async close() { this.opened = false; }
  async selectConfiguration() { this.configuration = { interfaces: [] }; }
  async claimInterface(n) { this.claimed.add(n); }
  async releaseInterface(n) { this.claimed.delete(n); }
  check() {
    if (this.gone) {
      const error = new Error("The device was disconnected.");
      error.name = "NotFoundError";
      throw error;
    }
  }
  async controlTransferOut(setup, data) {
    this.check();
    if (setup.request === 1) {  // DNLOAD
      const bytes = data ? new Uint8Array(data.buffer ?? data, data.byteOffset ?? 0, data.byteLength ?? data.length) : new Uint8Array(0);
      if (bytes.length === 0) {
        this.state = State.MANIFEST_SYNC;
        return { status: "ok", bytesWritten: 0 };
      }
      if (setup.value === this.dropAt) {
        this.dropAt = -1;
        this.received = [];
        this.state = State.IDLE;
        return { status: "ok", bytesWritten: bytes.length };
      }
      if (setup.value === this.errorAt) {
        this.state = State.ERROR;
        this.status = 8;  // errADDRESS
        return { status: "ok", bytesWritten: bytes.length };
      }
      if (setup.value !== this.received.length) throw new Error(`block ${setup.value} out of order`);
      this.received.push(Uint8Array.from(bytes));
      this.state = State.DNLOAD_SYNC;
      this.busyOnce = true;
      return { status: "ok", bytesWritten: bytes.length };
    }
    if (setup.request === 4 || setup.request === 6) {  // CLRSTATUS, ABORT
      this.state = State.IDLE;
      this.status = 0;
      this.received = [];
      return { status: "ok", bytesWritten: 0 };
    }
    if (setup.request === 0) return { status: "ok", bytesWritten: 0 };  // DETACH
    return { status: "stall" };
  }
  async controlTransferIn(setup) {
    this.check();
    if (setup.request !== 3) return { status: "stall" };
    let state = this.state;
    let poll = 0;
    if (state === State.DNLOAD_SYNC) {
      state = this.busyOnce ? State.DNBUSY : State.DNLOAD_IDLE;
      this.state = this.busyOnce ? State.DNLOAD_SYNC : State.DNLOAD_IDLE;
      if (this.busyOnce) poll = 1;
      this.busyOnce = false;
    } else if (state === State.MANIFEST_SYNC) {
      state = State.MANIFEST;
      this.state = State.MANIFEST;
      poll = 1;
    } else if (state === State.MANIFEST) {
      if (this.manifestEnd === "leave") {
        this.gone = true;
        this.check();
      }
      this.state = this.manifestEnd;
      state = this.manifestEnd;
    }
    const buffer = new ArrayBuffer(6);
    const view = new DataView(buffer);
    view.setUint8(0, this.status);
    view.setUint8(1, poll);
    view.setUint8(4, state);
    return { status: "ok", data: view };
  }
  image() {
    return Uint8Array.from(this.received.flatMap((chunk) => Array.from(chunk)));
  }
}

const IFACE = { number: 0, alternate: 0, name: "XR-DAP application", protocol: 2 };

function pattern(length) {
  return Uint8Array.from({ length }, (_, i) => (i * 7 + 3) & 0xff);
}

test("file names of a release", () => {
  assert.deepEqual(classifyFile("xrdap-ch32-wdap.bin"), { kind: "application", board: "wdap" });
  assert.deepEqual(classifyFile("xrdap-ch32-v305-144.bin"), { kind: "application", board: "v305" });
  assert.deepEqual(classifyFile("xrdap-ch32-linkw-bootloader-b.bin"),
                   { kind: "bootloader", board: "linkw", slot: "b" });
  assert.equal(classifyFile("xrdap-ch32-v305-boot-chain.bin").kind, "boot-chain");
  assert.equal(classifyFile("xrdap-ch32-wdap-migrate-to-ab.bin").kind, "migrate-to-ab");
  assert.equal(classifyFile("firmware.bin").kind, "unknown");
});

test("product strings", () => {
  assert.equal(boardOfProduct("XR-DAP-V305 CMSIS-DAP"), "v305");
  assert.equal(boardOfProduct("XR-DAP-V307 DFU 0.6.0+g920613b"), "wdap");
  assert.equal(boardOfProduct("XR-DAP-V208 DFU 0.6.0+g920613b"), "linkw");
  assert.equal(boardOfProduct("MainCtrl"), null);
  assert.equal(versionOfProduct("XR-DAP-V305 DFU 0.6.0+g920613b"), "0.6.0+g920613b");
});

test("bootloader image version skips the bare tag", () => {
  const text = "....XRDAP-BLVER:\0....XRDAP-BLVER:0.6.0+gabc1234\0tail";
  assert.equal(imageVersion(new TextEncoder().encode(text)), "0.6.0+gabc1234");
  assert.equal(imageVersion(new TextEncoder().encode("no tag here")), "");
});

// Configuration descriptor of the bootloader: interface 0 the application (string 4,
// 4096-byte transfers), interface 1 a bootloader slot (string 5).
const CONFIG = [
  9, 2, 45, 0, 2, 1, 0, 0x80, 50,
  9, 4, 0, 0, 0, 0xfe, 1, 2, 4,
  9, 0x21, 0x09, 0, 0, 0x00, 0x10, 0x10, 0x01,
  9, 4, 1, 0, 0, 0xfe, 1, 2, 5,
  9, 0x21, 0x09, 0, 0, 0x00, 0x04, 0x10, 0x01,
];

function stringDescriptor(text) {
  const bytes = [2 + 2 * text.length, 3];
  for (const ch of text) bytes.push(ch.charCodeAt(0) & 0xff, ch.charCodeAt(0) >> 8);
  return bytes;
}

test("DFU interfaces and transfer sizes from the configuration descriptor", () => {
  const interfaces = parseConfig(Uint8Array.from(CONFIG));
  assert.deepEqual(interfaces.map((i) => [i.number, i.protocol, i.stringIndex, i.transferSize]),
                   [[0, 2, 4, 4096], [1, 2, 5, 1024]]);
  assert.equal(transferSizeFromConfig(Uint8Array.from(CONFIG), 1), 1024);
  assert.equal(transferSizeFromConfig(Uint8Array.from(CONFIG), 2), 0);
  assert.equal(decodeStringDescriptor(Uint8Array.from(stringDescriptor("XR-DAP application"))),
               "XR-DAP application");
});

test("interface names come from the string descriptors", async () => {
  const strings = { 4: "XR-DAP application", 5: "XR-DAP bootloader slot B" };
  const device = {
    async controlTransferIn(setup, length) {
      const bytes = setup.value === 0x0200 ? CONFIG.slice(0, length)
          : stringDescriptor(strings[setup.value & 0xff]);
      return { status: "ok", data: new DataView(Uint8Array.from(bytes).buffer) };
    },
  };
  const interfaces = await readDfuInterfaces(device);
  assert.deepEqual(interfaces.map((i) => [i.number, i.name, i.transferSize]),
                   [[0, "XR-DAP application", 4096], [1, "XR-DAP bootloader slot B", 1024]]);
});

test("download to the application interface ends in MANIFEST-WAIT-RESET", async () => {
  const device = new FakeDevice();
  const dfu = new Dfu(device, IFACE);
  await dfu.open();
  await dfu.toIdle();
  const image = pattern(10000);
  const seen = [];
  assert.equal(await dfu.download(image, 4096, (done) => seen.push(done)), "wait-reset");
  assert.deepEqual(device.image(), image);
  assert.deepEqual(seen, [4096, 8192, 10000]);
});

test("a slot interface goes back to dfuIDLE; a device that leaves counts as done", async () => {
  const slot = new FakeDevice({ manifestEnd: State.IDLE });
  assert.equal(await new Dfu(slot, IFACE).download(pattern(5000), 4096), "idle");
  const leaving = new FakeDevice({ manifestEnd: "leave" });
  assert.equal(await new Dfu(leaving, IFACE).download(pattern(5000), 4096), "left");
});

test("a dropped session starts the download again", async () => {
  const device = new FakeDevice({ dropAt: 2 });
  const dfu = new Dfu(device, IFACE);
  const image = pattern(20000);
  await assert.rejects(dfu.download(image, 4096), DownloadInterrupted);
  await dfu.toIdle();
  const again = new FakeDevice({ dropAt: 2 });
  const retries = [];
  const result = await downloadWithRetry(new Dfu(again, IFACE), image, 4096, () => {},
                                         (attempt) => retries.push(attempt));
  assert.equal(result, "wait-reset");
  assert.deepEqual(retries, [1]);
  assert.deepEqual(again.image(), image);
});

test("a DFU error status is reported", async () => {
  const device = new FakeDevice({ errorAt: 1 });
  await assert.rejects(new Dfu(device, IFACE).download(pattern(9000), 4096),
                       (error) => error instanceof DfuError && error.status === 8);
});
