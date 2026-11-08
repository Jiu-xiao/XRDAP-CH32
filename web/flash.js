// SPDX-License-Identifier: Apache-2.0
// The flashing page: reads the release files the user picks, restarts the probe into its
// bootloader, writes the bootloader slots when asked and then the application.
import * as D from "./dfu.js";

const TEXT = {
  zh: {
    title: "XR-DAP CH32 固件升级",
    pathLabel: "固件升级",
    intro: "本页经 WebUSB 写入 XRDAP-CH32 的固件和 bootloader，在 Chrome 或 Edge 中运行，探针经 USB 线连接电脑。",
    appTitle: "固件",
    appHint: "发布页上的 xrdap-ch32-<固件>.bin，例如 xrdap-ch32-wdap.bin、xrdap-ch32-v305-144.bin。",
    pickApp: "选择固件",
    blTitle: "bootloader",
    blHint: "发布说明要求升级 bootloader 时，同时选择这块板子的 xrdap-ch32-<板子>-bootloader-a.bin 和 -bootloader-b.bin。两个槽依次写入，然后写入固件。",
    blCheck: "同时升级 bootloader",
    pickBl: "选择两个槽",
    writeTitle: "写入",
    keyHint: "设备列表中没有探针时，按住板上的 bootloader 键插上 USB，探针以名称带 DFU 的设备出现。Linux 需要 README 中的 udev 规则。",
    start: "开始写入",
    connectBl: "连接 bootloader",
    logTitle: "日志",
    footer: "源码与发布：",
    noUsb: "这个浏览器没有 WebUSB。本页在 Chrome 或 Edge 中运行。",
    running: "正在写入，结束后再开始下一次。",
    needBl: "探针已进入 bootloader。浏览器第一次遇到它时需要再授权一次：点击“连接 bootloader”，在列表中选择名称带 DFU 的设备。",
    noApp: "没有选择固件文件。",
    notApp: "{0} 不是固件文件。固件的文件名为 xrdap-ch32-<固件>.bin；启动链和迁移镜像的写法见 docs/boot.md。",
    needSlots: "升级 bootloader 需要同一块板子的 bootloader-a 和 bootloader-b 两个文件。",
    slotBoard: "bootloader 文件与固件不是同一块板子的。",
    notProbe: "所选设备不是 XR-DAP 探针。",
    boardMismatch: "固件属于 {0}，探针是 {1}。仍然写入吗？",
    cancelled: "已取消。",
    detach: "探针 {0} 重启进入 bootloader",
    blUp: "bootloader {0} 已就绪",
    slot: "写入 bootloader 槽 {0}：{1} → {2}",
    slotDone: "bootloader {0} 已启动",
    slotVersion: "bootloader 报告的版本是 {0}，文件中是 {1}。",
    app: "写入固件 {0}",
    retry: "下载中断，从第一块重新写入（第 {0} 次）",
    waitApp: "等待新固件启动",
    done: "完成：探针运行新固件。",
    doneNoApp: "完成：固件已写入，探针在几秒内启动新固件。本页没有访问它的授权，无法确认启动。",
    failed: "失败：{0}",
    busy: "设备无法打开，可能被其他程序占用（调试器、dfu-util 或另一个浏览器标签页）。",
    noBl: "没有等到 bootloader。拔下探针，按住 bootloader 键插上 USB，再点击“开始写入”。",
    noIface: "设备没有 {0} 接口。",
    lang: "English",
  },
  en: {
    title: "XR-DAP CH32 firmware update",
    pathLabel: "Firmware update",
    intro: "This page writes XRDAP-CH32 firmware and bootloaders over WebUSB. It runs in Chrome or Edge, with the probe on a USB cable.",
    appTitle: "Firmware",
    appHint: "xrdap-ch32-<firmware>.bin from the release page, for example xrdap-ch32-wdap.bin or xrdap-ch32-v305-144.bin.",
    pickApp: "Pick firmware",
    blTitle: "Bootloader",
    blHint: "When the release notes ask for a bootloader update, pick the board's xrdap-ch32-<board>-bootloader-a.bin and -bootloader-b.bin as well. Both slots are written in turn, then the firmware.",
    blCheck: "Update the bootloader as well",
    pickBl: "Pick both slots",
    writeTitle: "Write",
    keyHint: "If the probe is not in the device list, plug it in with the board's bootloader key held; it then appears as a device whose name has DFU. Linux needs the udev rules in the README.",
    start: "Start writing",
    connectBl: "Connect bootloader",
    logTitle: "Log",
    footer: "Source and releases:",
    noUsb: "This browser has no WebUSB. The page runs in Chrome or Edge.",
    running: "A write is running; the next one starts after it.",
    needBl: "The probe is in its bootloader. The first time the browser meets it, it asks for access once more: click \"Connect bootloader\" and pick the device whose name has DFU.",
    noApp: "No firmware file is picked.",
    notApp: "{0} is not a firmware file. Firmware files are named xrdap-ch32-<firmware>.bin; docs/boot.en.md describes how the boot chain and the migration image are written.",
    needSlots: "A bootloader update needs the board's bootloader-a and bootloader-b files.",
    slotBoard: "The bootloader files are not for the board of the firmware.",
    notProbe: "The device picked is not an XR-DAP probe.",
    boardMismatch: "The firmware is for {0}, the probe is {1}. Write it anyway?",
    cancelled: "Cancelled.",
    detach: "Probe {0} restarts into its bootloader",
    blUp: "Bootloader {0} ready",
    slot: "Bootloader slot {0}: {1} → {2}",
    slotDone: "Bootloader {0} started",
    slotVersion: "The bootloader reports {0}, the file holds {1}.",
    app: "Writing the firmware {0}",
    retry: "The download was interrupted; writing again from the first block (try {0})",
    waitApp: "Waiting for the new firmware",
    done: "Done: the probe runs the new firmware.",
    doneNoApp: "Done: the firmware is written and the probe starts it within a few seconds. This page has no access to it and cannot confirm the start.",
    failed: "Failed: {0}",
    busy: "The device cannot be opened; another program may hold it (a debugger, dfu-util or another browser tab).",
    noBl: "The bootloader did not appear. Unplug the probe, plug it in with the bootloader key held and click \"Start writing\" again.",
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
  $("logBox").hidden = false;
  const line = document.createElement("div");
  line.className = kind;
  line.textContent = `${new Date().toLocaleTimeString()}  ${message}`;
  $("log").append(line);
  $("log").scrollTop = $("log").scrollHeight;
  $("status").textContent = message;
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
  if (version && running !== version) log(t("slotVersion", running, version), "blocked");
  return next;
}

async function run() {
  $("log").textContent = "";
  $("logBox").hidden = true;
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
    log(t("cancelled"), "blocked");
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
  log(running ? t("done") : t("doneNoApp"), "pass");
}

function showFiles() {
  $("appName").textContent = Array.from($("app").files).map((f) => f.name).join(", ");
  $("blName").textContent = Array.from($("bl").files).map((f) => f.name).join(", ");
}

let running = false;

function init() {
  render();
  $("lang").onclick = () => {
    lang = lang === "zh" ? "en" : "zh";
    render();
  };
  $("withBl").onchange = () => {
    $("blBox").hidden = !$("withBl").checked;
  };
  $("app").onchange = showFiles;
  $("bl").onchange = showFiles;
  // The button stays clickable; a click that cannot start says why.
  $("start").onclick = async () => {
    if (!navigator.usb) {
      log(t("noUsb"), "fail");
      return;
    }
    if (running) {
      log(t("running"), "blocked");
      return;
    }
    running = true;
    try {
      await run();
    } catch (error) {
      if (error && error.name === "NotFoundError" && /No device selected/i.test(error.message)) {
        log(t("cancelled"), "blocked");
      } else {
        log(t("failed", error.message || error), "fail");
      }
    } finally {
      $("connect").hidden = true;
      running = false;
    }
  };
}

init();
