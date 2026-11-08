// SPDX-License-Identifier: Apache-2.0
// The flashing page: reads the release files the user picks, restarts the probe into its
// bootloader, writes the bootloader slots when asked and then the application.
import * as D from "./dfu.js";

const TEXT = {
  zh: {
    title: "XR-DAP CH32 固件升级",
    intro: "在浏览器里经 USB 写入 XRDAP-CH32 的固件，不需要安装程序或驱动。需要 Chrome 或 Edge。",
    noUsb: "这个浏览器不支持 WebUSB，请用 Chrome 或 Edge 打开本页。",
    appLabel: "固件文件",
    appHint: "发布页上的 xrdap-ch32-<固件>.bin，例如 xrdap-ch32-wdap.bin。",
    blCheck: "同时升级 bootloader",
    blHint: "选择这块板子的两个文件 xrdap-ch32-<板子>-bootloader-a.bin 和 -bootloader-b.bin。两个槽依次写入，然后写入固件。",
    start: "开始写入",
    connectBl: "连接 bootloader",
    keyHint: "列表里没有探针时，按住板上的 bootloader 键插上 USB，探针会以“… DFU”出现。Linux 需要 README 中的 udev 规则。",
    needBl: "探针已进入刷写模式。浏览器第一次遇到这个设备时需要再授权一次：点击“连接 bootloader”，在列表中选择名称带 DFU 的设备。",
    noApp: "请选择固件文件。",
    notApp: "{0} 不是固件文件。固件的文件名为 xrdap-ch32-<固件>.bin；启动链和迁移镜像的写法见 docs/boot.md。",
    needSlots: "升级 bootloader 需要同一块板子的 bootloader-a 和 bootloader-b 两个文件。",
    slotBoard: "bootloader 文件与固件不是同一块板子的。",
    notProbe: "所选设备不是 XR-DAP 探针。",
    boardMismatch: "固件是 {0} 的，探针是 {1}。仍然写入吗？",
    cancelled: "已取消。",
    detach: "探针 {0} 进入刷写模式",
    blUp: "bootloader {0} 已就绪",
    slot: "写入 bootloader 槽 {0}：{1} → {2}",
    slotDone: "bootloader {0} 已启动",
    slotVersion: "bootloader 报告的版本是 {0}，与文件的 {1} 不同。",
    app: "写入固件 {0}",
    retry: "写入中断，从头再写一次（第 {0} 次）",
    waitApp: "等待新固件启动",
    done: "完成：探针已运行新固件。",
    doneNoApp: "写入完成。探针会在几秒内启动新固件；本页没有它的访问授权，所以无法确认。",
    failed: "失败：{0}",
    busy: "无法打开设备，可能被其他程序占用（调试器、dfu-util 或另一个浏览器标签页）。",
    noBl: "没有等到 bootloader。拔下探针，按住 bootloader 键插上 USB，再点“开始写入”。",
    noIface: "设备没有 {0} 接口。",
    lang: "English",
  },
  en: {
    title: "XR-DAP CH32 firmware update",
    intro: "Writes XRDAP-CH32 firmware over USB from the browser, without installing a program or a driver. Needs Chrome or Edge.",
    noUsb: "This browser has no WebUSB; open this page in Chrome or Edge.",
    appLabel: "Firmware file",
    appHint: "xrdap-ch32-<firmware>.bin from the release page, for example xrdap-ch32-wdap.bin.",
    blCheck: "Update the bootloader as well",
    blHint: "Pick the board's two files xrdap-ch32-<board>-bootloader-a.bin and -bootloader-b.bin. Both slots are written in turn, then the firmware.",
    start: "Start",
    connectBl: "Connect bootloader",
    keyHint: "If the probe is not in the list, plug it in with the board's bootloader key held; it then appears as \"… DFU\". Linux needs the udev rules in the README.",
    needBl: "The probe is in its bootloader. The first time the browser meets this device it asks again: click \"Connect bootloader\" and pick the device whose name has DFU.",
    noApp: "Pick the firmware file.",
    notApp: "{0} is not a firmware file. Firmware files are named xrdap-ch32-<firmware>.bin; docs/boot.en.md describes how the boot chain and the migration image are written.",
    needSlots: "Updating the bootloader needs the board's bootloader-a and bootloader-b files.",
    slotBoard: "The bootloader files are not for the same board as the firmware.",
    notProbe: "The device picked is not an XR-DAP probe.",
    boardMismatch: "The firmware is for {0}, the probe is {1}. Write it anyway?",
    cancelled: "Cancelled.",
    detach: "Probe {0} restarts into its bootloader",
    blUp: "Bootloader {0} ready",
    slot: "Bootloader slot {0}: {1} → {2}",
    slotDone: "Bootloader {0} started",
    slotVersion: "The bootloader reports {0}, the file has {1}.",
    app: "Writing the firmware {0}",
    retry: "The download was interrupted; starting it again (try {0})",
    waitApp: "Waiting for the new firmware",
    done: "Done: the probe runs the new firmware.",
    doneNoApp: "Written. The probe starts the new firmware within a few seconds; this page has no access to it and cannot confirm.",
    failed: "Failed: {0}",
    busy: "The device cannot be opened; another program may hold it (a debugger, dfu-util or another browser tab).",
    noBl: "The bootloader did not appear. Unplug the probe, plug it in with the bootloader key held and click Start again.",
    noIface: "The device has no {0} interface.",
    lang: "中文",
  },
};

const BOARD_NAMES = { wdap: "wdap (CH32V307)", v305: "v305 (CH32V305)", linkw: "linkw (CH32V208)" };

let lang = (navigator.language || "").toLowerCase().startsWith("zh") ? "zh" : "en";
const $ = (id) => document.getElementById(id);

function t(key, ...args) {
  return TEXT[lang][key].replace(/\{(\d)\}/g, (_, i) => String(args[Number(i)]));
}

function render() {
  document.documentElement.lang = lang === "zh" ? "zh-CN" : "en";
  for (const element of document.querySelectorAll("[data-t]")) {
    element.textContent = t(element.dataset.t);
  }
  document.title = t("title");
}

function log(message, kind = "") {
  const line = document.createElement("div");
  line.className = kind;
  const time = new Date().toLocaleTimeString();
  line.textContent = `${time}  ${message}`;
  $("log").append(line);
  $("log").scrollTop = $("log").scrollHeight;
  if (kind !== "detail") $("status").textContent = message;
  $("status").className = kind;
}

function progress(done, total) {
  $("bar").style.width = total ? `${Math.round((100 * done) / total)}%` : "0%";
}

async function readFile(file) {
  return { name: file.name, bytes: new Uint8Array(await file.arrayBuffer()), info: D.classifyFile(file.name) };
}

function sameDevice(device, filter, serial) {
  return device.vendorId === filter.vendorId && device.productId === filter.productId &&
         device.serialNumber === serial;
}

// A device the page already has access to: the probe after it re-enumerated. `old` is the
// object of the previous enumeration, which can still be listed for a moment.
async function waitForDevice(filter, serial, timeoutMs, old = null) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    const devices = await navigator.usb.getDevices();
    const found = devices.find((device) => device !== old && sameDevice(device, filter, serial));
    if (found) return found;
    await D.sleep(200);
  }
  return null;
}

// A click is needed for the browser's device list; the page waits for one on the
// "Connect bootloader" button.
function waitForClick(button) {
  return new Promise((resolve) => {
    button.hidden = false;
    button.onclick = () => {
      button.hidden = true;
      resolve();
    };
  });
}

async function openInterface(device, match, label) {
  if (!device.opened) await device.open();
  if (!device.configuration) await device.selectConfiguration(1);
  const interfaces = await D.readDfuInterfaces(device);
  const iface = interfaces.find(match);
  if (!iface) {
    const names = interfaces.map((i) => `${i.number}: ${i.name}`).join(", ");
    throw new Error(`${t("noIface", label)} (${names})`);
  }
  const dfu = new D.Dfu(device, iface);
  try {
    await dfu.open();
  } catch (error) {
    throw new Error(`${t("busy")} (${error.message})`);
  }
  return dfu;
}

async function write(dfu, image) {
  await dfu.toIdle();
  return D.downloadWithRetry(dfu, image, dfu.iface.transferSize, progress,
                             (attempt) => log(t("retry", attempt)));
}

async function restartIntoBootloader(device, serial) {
  log(t("detach", device.productName));
  const dfu = await openInterface(device, (i) => i.protocol === 1, "DFU runtime");
  try {
    await dfu.detach();
  } catch (error) {
    if (!D.isDisconnect(error)) throw error;
  }
  await dfu.close();
  let bootloader = await waitForDevice(D.BOOTLOADER_ID, serial, 8000);
  if (!bootloader) {
    log(t("needBl"));
    await waitForClick($("connect"));
    bootloader = await navigator.usb.requestDevice({ filters: [{ ...D.BOOTLOADER_ID, serialNumber: serial }] });
  }
  return bootloader;
}

async function writeSlot(bootloader, slots, serial) {
  const dfu = await openInterface(bootloader, (i) => i.name.startsWith(D.SLOT_INTERFACE), "bootloader slot");
  const letter = dfu.iface.name.slice(D.SLOT_INTERFACE.length).trim().charAt(0).toLowerCase();
  const file = slots[letter];
  const version = D.imageVersion(file.bytes);
  log(t("slot", letter.toUpperCase(), D.versionOfProduct(bootloader.productName), version));
  await write(dfu, file.bytes);
  await dfu.close();
  // The bootloader closes the slot and restarts; stage 1 starts the new one in DFU mode.
  const next = await waitForDevice(D.BOOTLOADER_ID, serial, 15000, bootloader);
  if (!next) throw new Error(t("noBl"));
  const running = D.versionOfProduct(next.productName);
  log(t("slotDone", running));
  if (version && running !== version) log(t("slotVersion", running, version), "warn");
  return next;
}

async function run() {
  $("log").textContent = "";
  progress(0, 0);
  const appFile = $("app").files[0];
  if (!appFile) throw new Error(t("noApp"));
  const app = await readFile(appFile);
  if (app.info.kind !== "application") throw new Error(t("notApp", app.name));
  let slots = null;
  if ($("withBl").checked) {
    slots = {};
    for (const file of $("bl").files) {
      const read = await readFile(file);
      if (read.info.kind === "bootloader") slots[read.info.slot] = read;
    }
    if (!slots.a || !slots.b) throw new Error(t("needSlots"));
    if (slots.a.info.board !== app.info.board || slots.b.info.board !== app.info.board) {
      throw new Error(t("slotBoard"));
    }
  }

  const device = await navigator.usb.requestDevice({ filters: [D.APP_ID, D.BOOTLOADER_ID] });
  const serial = device.serialNumber || "";
  if (!serial.startsWith("XRobot-XRDAP-")) throw new Error(t("notProbe"));
  const board = D.boardOfProduct(device.productName);
  if (board && board !== app.info.board &&
      !window.confirm(t("boardMismatch", BOARD_NAMES[app.info.board] || app.info.board,
                        BOARD_NAMES[board] || board))) {
    log(t("cancelled"), "warn");
    return;
  }

  let bootloader = sameDevice(device, D.APP_ID, serial)
      ? await restartIntoBootloader(device, serial) : device;
  log(t("blUp", D.versionOfProduct(bootloader.productName)));
  if (slots) {
    bootloader = await writeSlot(bootloader, slots, serial);
    bootloader = await writeSlot(bootloader, slots, serial);
  }

  log(t("app", app.name));
  const dfu = await openInterface(bootloader, (i) => i.name === D.APP_INTERFACE, D.APP_INTERFACE);
  await write(dfu, app.bytes);
  await dfu.close();
  log(t("waitApp"));
  const running = await waitForDevice(D.APP_ID, serial, 10000);
  log(running ? t("done") : t("doneNoApp"), "ok");
}

function init() {
  render();
  $("lang").onclick = () => {
    lang = lang === "zh" ? "en" : "zh";
    render();
  };
  $("withBl").onchange = () => {
    $("blBox").hidden = !$("withBl").checked;
  };
  if (!navigator.usb) {
    $("start").disabled = true;
    log(t("noUsb"), "error");
    return;
  }
  $("start").onclick = async () => {
    $("start").disabled = true;
    try {
      await run();
    } catch (error) {
      if (error && error.name === "NotFoundError" && /No device selected/i.test(error.message)) {
        log(t("cancelled"), "warn");
      } else {
        log(t("failed", error.message || error), "error");
      }
    } finally {
      $("connect").hidden = true;
      $("start").disabled = false;
    }
  };
}

init();
