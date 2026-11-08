# Boot chain and flashing

[中文](boot.md)

This document describes the boot chain and flash layout of XRDAP-CH32, the first flashing, the migration from older firmware, and how the application and the bootloader are written over USB DFU.

File names here are those of the release files, with `<firmware>` the preset name and `<board>` the board name (`wdap`, `v305`, `linkw`). `tools/build.sh` puts the same images in `build/images/<preset>/`: the application `xrdap.elf.bin`, the boot chain `boot-chain.bin`, the slot images `bootloader-a.elf.bin` and `bootloader-b.elf.bin`, and the migration image `migrate-to-ab.elf.bin`.

## Boot chain

The flash starts with stage 1 (`bootloader/stage1.S`), followed by two bootloader slots, each holding a copy of the DFU bootloader. On every reset stage 1 reads the bootloader key, checks the slot record at the end of each slot (`common/boot_slots.hpp`: magic, sequence number and its complement, length, CRC32 and its complement, slot address, version) and starts the valid slot with the higher sequence number. With the bootloader key held at power-up, stage 1 starts the other valid slot, whose bootloader sees the key as well and stays in DFU mode; this returns to the previous bootloader. With no valid slot stage 1 stops, and only a WCH-Link or the chip's USB download mode can write the boot chain again.

The same bootloader code is linked once for each slot. A running bootloader writes only the other slot: a download first erases that slot's record, and the record is written last, after the image is written and verified, with the writer's own sequence number plus 1. When a download stops or power fails, that slot has no record and stage 1 still starts the old slot. Images linked for the other slot's address, images over `0xCF00` bytes and bootloader images of other boards are refused.

The application's control request `0x17` reports the running slot and the sequence numbers and versions of both slots (`app/boot_slot_info.hpp`).

## Flash layout

`wdap`, `wdap-144`:

| Address | Contents |
|---|---|
| `0x00000000`–`0x00000FFF` | Stage 1 |
| `0x00001000`–`0x0000DFFF` | Bootloader slot A (the last 256 bytes are the slot record) |
| `0x0000E000`–`0x0001AFFF` | Bootloader slot B |
| `0x0001B000`–`0x0003F6FF` | Application |
| `0x0003F700`–`0x0003FEFF` | Settings: role, rate, channel lock, pairing |
| `0x0003FF00`–`0x0003FFFF` | Seal: size and CRC32 of the application |

`v305`, `v305-144`:

| Address | Contents |
|---|---|
| `0x00000000`–`0x00000FFF` | Stage 1 |
| `0x00002000`–`0x0001F6FF` | Application |
| `0x0001F700`–`0x0001FEFF` | Settings (the board has no radio; the firmware writes no settings) |
| `0x0001FF00`–`0x0001FFFF` | Seal |
| `0x00020000`–`0x0002CFFF` | Bootloader slot A |
| `0x0002D000`–`0x00039FFF` | Bootloader slot B |

`linkw`:

| Address | Contents |
|---|---|
| `0x00000000`–`0x00000FFF` | Stage 1 |
| `0x00001000`–`0x0003F6FF` | Application |
| `0x0003F700`–`0x0003FEFF` | Settings |
| `0x0003FF00`–`0x0003FFFF` | Seal |
| `0x00040000`–`0x0004CFFF` | Bootloader slot A |
| `0x0004D000`–`0x00059FFF` | Bootloader slot B |

The bootloader runs at 96 MHz. On `v305` and `linkw` the application is in the chip's zero-wait flash and the bootloader slots above it, run only in DFU. The CH32V305FB datasheet states 224 KB of code flash; slot B of `v305` ends at `0x3A000`, and the part beyond 224 KB holds the slot record. On the CH32V307 the application area reaches past 192 KB: with the user option FLASH 256K + RAM 64K the whole application is in zero-wait flash, with FLASH 192K + RAM 128K the part past 192 KB runs slower.

A DFU download writes only up to the settings: application images over `0x24700` bytes (`0x1D700` on `v305`, `0x3E700` on `linkw`) are refused, and the settings are left alone. The top 256 bytes of RAM hold the boot mailbox and the watchdog count (`common/reserved_ram.h`).

## When the bootloader stays in DFU mode

- The bootloader key is held at power-up.
- The boot mailbox at the top of RAM (`0x2000FFF0`, `0x20007FF0` on `v305` and `linkw`) holds a request for DFU. The application makes it on DFU DETACH and the bootloader after writing the other slot; it survives a software reset.
- The application area has no seal, the seal's CRC does not match, or the image is not linked for the application address (the second word of the vector table is not the application's start address).

In DFU mode the computer sees the USB device `1209:3072`, named XR-DAP-V307 DFU (XR-DAP-V305 DFU on `v305`, XR-DAP-V208 DFU on `linkw`) followed by the version. On boards with a single LED (`v305`, `linkw`) the LED blinks.

## First flashing

The first image is the boot chain `xrdap-ch32-<board>-boot-chain.bin`: stage 1 and the board's first bootloader slot (slot B on `v305`, slot A on the other boards). The application area is then empty, the bootloader stays in DFU mode, and the application is written as the README shows.

A WCH-Link or WCH-LinkE (RISC-V mode) on the board's two-wire debug port (SWDIO, SWCLK, GND) writes it with the WCH OpenOCD shipped with MounRiver Studio, here for `wdap`:

```
openocd -f tools/wch-riscv.cfg -c init -c halt -c "flash erase_sector wch_riscv.flash 0 last" -c "program xrdap-ch32-wdap-boot-chain.bin 0x00000000 verify" -c "reset run" -c shutdown
```

The bootloader slots of `v305` lie above 128 KB, which the WCH OpenOCD refuses as it checks addresses against 128 KB; WCH-LinkUtility writes the boot chain to `0x08000000` instead.

A `wdap` without a debug header can use the chip's USB download mode: with BOOT0 high at power-up the computer sees `4348:55E0`, and WCHISPTool_CH32Vxxx from MounRiver Studio (chip CH32V307, download over USB, no read protection) or [wchisp](https://github.com/ch32-rs/wchisp) (`wchisp flash xrdap-ch32-wdap-boot-chain.bin`) writes the image.

`linkw` uses the chip's USB download mode: with the BOOT key held while USB is plugged in the computer sees `1a86:55E0`, and WCHISPTool_CH32Vxxx (chip CH32V208, download over USB, no read protection) writes the image. A WCH-LinkW leaves the factory with read protection on, and the tool refuses to write; "remove code protection" erases the flash and takes the chip out of download mode, after which the BOOT key is held again while USB is plugged in and the image is written.

### Factory WCH-LinkE and WCH-LinkW

`v305` and `linkw` share their circuits with the WCH-LinkE and the WCH-LinkW, so a factory WCH-LinkE or WCH-LinkW works as an XR-DAP once it has the `v305` or `linkw` firmware. When the factory firmware is replaced with this repository's firmware, the first image is again the boot chain. A WCH-LinkW is written as in the previous paragraph.

The CH32V305FBP6 does not bring BOOT0 out; the chip pulls it to GND internally, so a WCH-LinkE cannot enter the chip's USB download mode and is written through its debug port by a second WCH-LinkE. The steps are those of the two-wire offline update in WCH's WCH-Link user manual, with the boot chain as the file:

1. The 3V3, GND, SWDIO and SWCLK of the two WCH-LinkEs are wired together, and the one acting as debugger (RISC-V mode) is plugged into the computer.
2. The WCH-LinkE to be rewritten is plugged into USB with its IAP key held; when its blue LED blinks it is in the IAP mode of the factory firmware.
3. In WCH-LinkUtility, with chip CH32V30x selected, Target → Clear All Code Flash-By Power off erases the whole flash.
4. The chip's read protection is removed.
5. With Program, Verify and Reset and run ticked, `xrdap-ch32-v305-boot-chain.bin` is written to `0x08000000`.

## Migration from older firmware

A board with the older single bootloader (at address 0, application at `0x00010000`) needs no debugger: this repository's `tools/dfu_update.py` writes `xrdap-ch32-<board>-migrate-to-ab.bin`, the old bootloader starts it as an application, and it writes the boot chain and restarts; the new bootloader stays in DFU mode. A power failure during this step leaves the board without a bootloader, and only the previous section's methods write the boot chain again. The settings stay where they are, but their format before 0.6 differs, so the two probes of a wireless pair are paired again.

A `v305` with the three-stage boot (USB `1209:3070`) uses the migration image of `v305`:

```
python tools/dfu_update.py --bootloader 1209:3070 --run-app xrdap-ch32-v305-migrate-to-ab.bin
```

The migration image first writes slot B and verifies each page while the old stage 1 and bootloader stay as they are; if it fails, the board restarts into the old bootloader and the step can be repeated. Stage 1 is written last, with the page holding the entry point changed last; only a power failure during the few milliseconds of that page needs a WCH-Link for recovery. A board still running the earlier application (USB `0d28:2041`) is powered up with the IAP key held, so that the three-stage boot's bootloader stays in DFU, and the migration image is written then.

`linkw` has no migration image.

## Writing the application and the bootloader

Besides the DAP interface the application has a DFU runtime interface. A writing tool sends DFU DETACH to it, the probe restarts into the bootloader, and the image is written over standard USB DFU 1.1. At the end of the download the bootloader writes the seal: when the host then asks for the status, it starts the new application at once; when the host asks no more (WebUSB on Windows cannot reset the device either), it starts the new application 2 s after the seal. On Windows the bootloader declares WinUSB, so no driver needs installing.

In DFU mode the bootloader has two interfaces: interface 0 (`XR-DAP application`) writes the application, interface 1 (`XR-DAP bootloader slot A` or `... slot B`) writes the other bootloader slot. After writing the slot record the bootloader restarts, stage 1 starts the new bootloader, and interface 1 then names the other slot; updating both slots writes twice.

The update page (`web/`, published at https://jiu-xiao.github.io/XRDAP-CH32/ ) takes these steps over WebUSB. It reads the interface names and the transfer size of the DFU functional descriptor from the descriptors, waits for the bootloader to enumerate again after a slot, and starts a download again from the first block when the bootloader goes back to dfuIDLE in its middle.

`tools/dfu_update.py` needs Python and `pip install pyusb libusb-package`. `--with-bootloader` looks for the two slot images in the directory of the application image: `xrdap-ch32-<board>-bootloader-a.bin` and `-bootloader-b.bin` beside the release file `xrdap-ch32-<firmware>.bin`, or `bootloader-a.elf.bin` and `bootloader-b.elf.bin` in `build/images/<preset>/`. It compares the version of that slot's image with the running version in the USB product string and writes the bootloader first when they differ, then the application; when the versions are equal the bootloader is not written, and `--force-bootloader` writes it anyway. Updating both slots takes two runs, the second with `--force-bootloader`; `--serial` selects one of several probes:

```
python tools/dfu_update.py --with-bootloader xrdap-ch32-wdap.bin
```

dfu-util sends DETACH as well. Both DFU interfaces have alternate setting 0, so the command selects the application interface by name, here for `wdap`:

```
dfu-util -d 1d50:6199,1209:3072 -S XRobot-XRDAP-<UID> -a "XR-DAP application" -D xrdap-ch32-wdap.bin
```

dfu-util warns that the image has no DFU suffix; the write is not affected.

## Watchdog and safe mode

The application runs the independent watchdog, which resets the chip when the main loop has not run for about 8 s. After three watchdog resets in a row the application starts in safe mode: it neither reads nor writes the settings, works only as a wired probe, and DFU works as usual. It returns to normal after 30 s of normal running or a power cycle.
