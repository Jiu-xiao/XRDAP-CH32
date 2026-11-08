// SPDX-License-Identifier: Apache-2.0
// USB DFU 1.1 over WebUSB for the XR-DAP CH32 probes, and the checks the flashing page
// makes on files and devices. No browser API is used at import time, so the module also
// runs under Node for the tests in web/test/.

export const APP_ID = { vendorId: 0x1d50, productId: 0x6199 };
export const BOOTLOADER_ID = { vendorId: 0x1209, productId: 0x3072 };
export const APP_INTERFACE = "XR-DAP application";
export const SLOT_INTERFACE = "XR-DAP bootloader slot ";
export const VERSION_TAG = "XRDAP-BLVER:";

const DETACH = 0, DNLOAD = 1, GETSTATUS = 3, CLRSTATUS = 4, ABORT = 6;

export const State = {
  APP_IDLE: 0, APP_DETACH: 1, IDLE: 2, DNLOAD_SYNC: 3, DNBUSY: 4, DNLOAD_IDLE: 5,
  MANIFEST_SYNC: 6, MANIFEST: 7, MANIFEST_WAIT_RESET: 8, UPLOAD_IDLE: 9, ERROR: 10,
};

// DFU 1.1 status codes, by name for messages.
export const STATUS_NAMES = [
  "OK", "errTARGET", "errFILE", "errWRITE", "errERASE", "errCHECK_ERASED", "errPROG",
  "errVERIFY", "errADDRESS", "errNOTDONE", "errFIRMWARE", "errVENDOR", "errUSBR",
  "errPOR", "errUNKNOWN", "errSTALLEDPKT",
];

// Board of each probe, from the USB product string ("XR-DAP-V305 CMSIS-DAP",
// "XR-DAP-V305 DFU 0.6.0+g...").
const CHIP_BOARD = { V307: "wdap", V305: "v305", V208: "linkw" };

export class DfuError extends Error {
  constructor(message, status = 0) {
    super(message);
    this.status = status;
  }
}

// The bootloader went back to dfuIDLE in the middle of a download: the session is lost
// (an older bootloader drops a block now and then) and the download starts again.
export class DownloadInterrupted extends Error {}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function isDisconnect(error) {
  const name = error && error.name;
  return name === "NotFoundError" || name === "NetworkError" || name === "InvalidStateError";
}

export function boardOfProduct(product) {
  const match = /XR-DAP-(V\d{3})/.exec(product || "");
  return match ? CHIP_BOARD[match[1]] || null : null;
}

// Running bootloader version, the last word of its product string.
export function versionOfProduct(product) {
  const words = (product || "").trim().split(/\s+/);
  return words.length > 2 ? words[words.length - 1] : "";
}

// Release file names: xrdap-ch32-<firmware>.bin, xrdap-ch32-<board>-bootloader-a.bin, ...
export function classifyFile(name) {
  const lower = (name || "").toLowerCase();
  let match = /^xrdap-ch32-([a-z0-9]+)(?:-144)?-bootloader-([ab])\.bin$/.exec(lower);
  if (match) return { kind: "bootloader", board: match[1], slot: match[2] };
  match = /^xrdap-ch32-([a-z0-9]+)(?:-144)?-(boot-chain|migrate-to-ab)\.bin$/.exec(lower);
  if (match) return { kind: match[2], board: match[1] };
  match = /^xrdap-ch32-([a-z0-9]+)(?:-144)?\.bin$/.exec(lower);
  if (match) return { kind: "application", board: match[1] };
  return { kind: "unknown", board: null };
}

// Version string of a bootloader image: the text after the first version tag that is
// followed by one (the image also holds the bare tag the search code uses).
export function imageVersion(bytes) {
  const tag = new TextEncoder().encode(VERSION_TAG);
  for (let i = 0; i + tag.length < bytes.length; ++i) {
    let hit = true;
    for (let k = 0; k < tag.length; ++k) {
      if (bytes[i + k] !== tag[k]) {
        hit = false;
        break;
      }
    }
    if (!hit || bytes[i + tag.length] === 0) continue;
    let end = i + tag.length;
    while (end < bytes.length && bytes[end] !== 0) ++end;
    return new TextDecoder().decode(bytes.subarray(i + tag.length, end));
  }
  return "";
}

// DFU interfaces in a configuration descriptor: number, alternate setting, protocol
// (1 runtime, 2 DFU mode), the index of the interface string, and wTransferSize from the
// DFU functional descriptor that follows the interface (0 when there is none). WebUSB does
// not expose class descriptors, and on Windows its interface names can be the product
// string, so the page reads both from the descriptors itself.
export function parseConfig(bytes) {
  const found = [];
  let current = null;
  for (let i = 0; i + 1 < bytes.length && bytes[i] > 0; i += bytes[i]) {
    const type = bytes[i + 1];
    if (type === 0x04 && bytes[i] >= 9) {
      current = bytes[i + 5] === 0xfe && bytes[i + 6] === 0x01
          ? { number: bytes[i + 2], alternate: bytes[i + 3], protocol: bytes[i + 7],
              stringIndex: bytes[i + 8], transferSize: 0 }
          : null;
      if (current) found.push(current);
    }
    if (type === 0x21 && current && bytes[i] >= 7) {
      current.transferSize = bytes[i + 5] | (bytes[i + 6] << 8);
    }
  }
  return found;
}

export function transferSizeFromConfig(bytes, number) {
  const iface = parseConfig(bytes).find((i) => i.number === number);
  return iface ? iface.transferSize : 0;
}

export function decodeStringDescriptor(bytes) {
  const length = Math.min(bytes[0] || 0, bytes.length);
  let text = "";
  for (let i = 2; i + 1 < length; i += 2) text += String.fromCharCode(bytes[i] | (bytes[i + 1] << 8));
  return text;
}

function bytesOf(result) {
  return new Uint8Array(result.data.buffer, result.data.byteOffset, result.data.byteLength);
}

async function readDescriptor(device, value, index, length) {
  const setup = { requestType: "standard", recipient: "device", request: 6, value, index };
  const result = await device.controlTransferIn(setup, length);
  if (result.status !== "ok") throw new DfuError(`GET_DESCRIPTOR 0x${value.toString(16)}: ${result.status}`);
  return bytesOf(result);
}

// DFU interfaces of an opened device, with names and transfer sizes from its descriptors.
export async function readDfuInterfaces(device) {
  const head = await readDescriptor(device, 0x0200, 0, 9);
  const total = head[2] | (head[3] << 8);
  const config = await readDescriptor(device, 0x0200, 0, total);
  const interfaces = parseConfig(config);
  for (const iface of interfaces) {
    iface.name = iface.stringIndex
        ? decodeStringDescriptor(await readDescriptor(device, 0x0300 | iface.stringIndex, 0x0409, 255))
        : "";
    if (!iface.transferSize) iface.transferSize = 1024;
  }
  return interfaces;
}

export class Dfu {
  constructor(device, iface) {
    this.device = device;
    this.iface = iface;
  }

  async open() {
    if (!this.device.opened) await this.device.open();
    if (!this.device.configuration) await this.device.selectConfiguration(1);
    await this.device.claimInterface(this.iface.number);
    if (this.iface.alternate) {
      await this.device.selectAlternateInterface(this.iface.number, this.iface.alternate);
    }
  }

  async close() {
    try {
      await this.device.releaseInterface(this.iface.number);
    } catch (error) {
      // already gone
    }
    try {
      await this.device.close();
    } catch (error) {
      // already gone
    }
  }

  setup(request, value) {
    return { requestType: "class", recipient: "interface", request, value, index: this.iface.number };
  }

  async out(request, value, data) {
    const result = await this.device.controlTransferOut(this.setup(request, value), data);
    if (result.status !== "ok") throw new DfuError(`request ${request}: ${result.status}`);
    return result;
  }

  async getStatus() {
    const result = await this.device.controlTransferIn(this.setup(GETSTATUS, 0), 6);
    if (result.status !== "ok") throw new DfuError(`GETSTATUS: ${result.status}`);
    const data = result.data;
    return {
      status: data.getUint8(0),
      poll: data.getUint8(1) | (data.getUint8(2) << 8) | (data.getUint8(3) << 16),
      state: data.getUint8(4),
    };
  }

  async detach() {
    await this.out(DETACH, 1000, undefined);
  }

  // Bring the interface to dfuIDLE from an error or an earlier unfinished session.
  async toIdle() {
    let status = await this.getStatus();
    if (status.state === State.ERROR) {
      await this.out(CLRSTATUS, 0, undefined);
      status = await this.getStatus();
    }
    if (status.state !== State.IDLE) {
      await this.out(ABORT, 0, undefined);
      status = await this.getStatus();
    }
    if (status.state !== State.IDLE) throw new DfuError(`not idle: state ${status.state}`);
  }

  async waitWhileBusy(busy, timeoutMs = 15000) {
    const end = Date.now() + timeoutMs;
    for (;;) {
      const status = await this.getStatus();
      if (status.state === State.ERROR || status.status !== 0) {
        throw new DfuError(`DFU ${STATUS_NAMES[status.status] || status.status}`, status.status);
      }
      if (!busy(status.state)) return status;
      if (Date.now() > end) throw new DfuError(`timeout in state ${status.state}`);
      await sleep(Math.max(status.poll, 5));
    }
  }

  // Writes `image` and finishes with the manifestation. Returns "idle" (a bootloader slot
  // interface goes back to dfuIDLE), "wait-reset" or "left" (the device started the new
  // application and left the bus).
  async download(image, transferSize, onProgress = () => {}) {
    const blocks = Math.ceil(image.length / transferSize);
    for (let block = 0; block < blocks; ++block) {
      const chunk = image.subarray(block * transferSize, (block + 1) * transferSize);
      await this.out(DNLOAD, block, chunk);
      const status = await this.waitWhileBusy(
        (state) => state === State.DNLOAD_SYNC || state === State.DNBUSY);
      if (status.state === State.IDLE) throw new DownloadInterrupted(`block ${block}`);
      if (status.state !== State.DNLOAD_IDLE) {
        throw new DfuError(`block ${block}: state ${status.state}`);
      }
      onProgress(Math.min((block + 1) * transferSize, image.length), image.length);
    }
    await this.out(DNLOAD, blocks, undefined);
    try {
      const status = await this.waitWhileBusy(
        (state) => state === State.MANIFEST_SYNC || state === State.MANIFEST);
      return status.state === State.MANIFEST_WAIT_RESET ? "wait-reset" : "idle";
    } catch (error) {
      if (isDisconnect(error)) return "left";
      throw error;
    }
  }
}

// Download with a fresh session after a dropped one, up to `tries` times.
export async function downloadWithRetry(dfu, image, transferSize, onProgress, onRetry, tries = 3) {
  for (let attempt = 1; ; ++attempt) {
    try {
      return await dfu.download(image, transferSize, onProgress);
    } catch (error) {
      if (!(error instanceof DownloadInterrupted) || attempt >= tries) throw error;
      onRetry(attempt);
      await dfu.toIdle();
    }
  }
}
