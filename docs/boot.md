# 启动链与烧录

[English](boot.en.md)

本文说明 XRDAP-CH32 的启动链、Flash 布局、第一次烧录、从旧版固件迁移，以及经 USB DFU 写入应用和 bootloader 的细节。

## 启动链

Flash 开头是 stage1（`bootloader/stage1.S`），之后是两个引导槽，各放一份 DFU bootloader。stage1 每次复位时读 bootloader 键，检查两个槽末尾的槽记录（`common/boot_slots.hpp`：魔数、序号及其反码、长度、CRC32 及其反码、槽地址、版本），启动有效槽中序号大的那个。上电时按住 bootloader 键，stage1 启动另一个有效槽，那个 bootloader 同样看到按键而停在 DFU 模式，用于退回上一版 bootloader。两个槽都无效时 stage1 停住，只能用 WCH-Link 或芯片的 USB 下载模式重新写入启动链。

同一份 bootloader 代码为两个槽各链接一次。运行中的 bootloader 只写另一个槽：下载开始时先擦掉那个槽的记录，镜像写完并校验后最后写记录，序号为自己的加 1。下载中止或中途断电时，那个槽没有记录，stage1 仍启动原来的槽。按另一个槽地址链接的镜像、超过 `0xCF00` 字节的镜像，以及其他板子的 bootloader 镜像都被拒收。

应用的控制请求 `0x17` 报告正在运行的槽、两个槽的序号和版本（`app/boot_slot_info.hpp`）。

## Flash 布局

`wdap`、`wdap-144`：

| 地址 | 内容 |
|---|---|
| `0x00000000`–`0x00000FFF` | stage1 |
| `0x00001000`–`0x0000DFFF` | 引导槽 A（最后 256 字节为槽记录） |
| `0x0000E000`–`0x0001AFFF` | 引导槽 B |
| `0x0001B000`–`0x0003F6FF` | 应用 |
| `0x0003F700`–`0x0003FEFF` | 设置区：角色、速率、信道锁定、配对 |
| `0x0003FF00`–`0x0003FFFF` | seal：应用的大小和 CRC32 |

`v305`、`v305-144`：

| 地址 | 内容 |
|---|---|
| `0x00000000`–`0x00000FFF` | stage1 |
| `0x00002000`–`0x0001F6FF` | 应用 |
| `0x0001F700`–`0x0001FEFF` | 设置区（这块板没有射频，固件不写设置） |
| `0x0001FF00`–`0x0001FFFF` | seal |
| `0x00020000`–`0x0002CFFF` | 引导槽 A |
| `0x0002D000`–`0x00039FFF` | 引导槽 B |

`linkw`：

| 地址 | 内容 |
|---|---|
| `0x00000000`–`0x00000FFF` | stage1 |
| `0x00001000`–`0x0003F6FF` | 应用 |
| `0x0003F700`–`0x0003FEFF` | 设置区 |
| `0x0003FF00`–`0x0003FFFF` | seal |
| `0x00040000`–`0x0004CFFF` | 引导槽 A |
| `0x0004D000`–`0x00059FFF` | 引导槽 B |

bootloader 运行在 96 MHz。`v305` 和 `linkw` 的应用放在芯片的零等待 Flash 内，引导槽在零等待区之上，只在 DFU 时运行。CH32V305FB 的数据手册标称 224 KB 代码 Flash，`v305` 的槽 B 结束于 `0x3A000`，超出 224 KB 的部分放着槽记录。CH32V307 的应用区延伸到 192 KB 以上：用户选择字为 FLASH 256K + RAM 64K 时整个应用都在零等待区，为 FLASH 192K + RAM 128K 时超出 192 KB 的部分运行较慢。

DFU 下载只写到设置区之前，超过 `0x24700` 字节（`v305` 为 `0x1D700`，`linkw` 为 `0x3E700`）的应用镜像被拒收，设置区不受影响。RAM 顶部 256 字节留给启动信箱和看门狗计数（`common/reserved_ram.h`）。

## bootloader 停在 DFU 模式的条件

- 上电时按住 bootloader 键；
- RAM 顶部的启动信箱（`0x2000FFF0`，`v305`、`linkw` 为 `0x20007FF0`）中有进入 DFU 的请求。应用收到 DFU DETACH 时、bootloader 写完另一个槽时都经它请求，软件复位后请求保留；
- 应用区没有 seal、seal 的 CRC 不符，或镜像不是按应用地址链接的（向量表第二个字不等于应用起始地址）。

停在 DFU 模式时电脑上出现 USB 设备 `1209:3072`，产品名为 XR-DAP-V307 DFU（`v305` 为 XR-DAP-V305 DFU，`linkw` 为 XR-DAP-V208 DFU）加版本号。有单色指示灯的板子（`v305`、`linkw`）此时指示灯闪烁。

## 第一次烧录

第一次写入的是启动链 `boot-chain.bin`：stage1 和板子的首个引导槽（`v305` 为槽 B，其他板子为槽 A）。写入后应用区为空，bootloader 停在 DFU 模式，再按 README 写入应用。

用 WCH-Link 或 WCH-LinkE（RISC-V 模式）连接板子的两线调试口（SWDIO、SWCLK、GND），用 MounRiver Studio 带的 WCH OpenOCD 写入：

```
openocd -f tools/wch-riscv.cfg -c init -c halt -c "flash erase_sector wch_riscv.flash 0 last" -c "program boot-chain.bin 0x00000000 verify" -c "reset run" -c shutdown
```

`v305` 的引导槽在 128 KB 以上，WCH OpenOCD 按 128 KB 检查地址而拒绝写入，改用 WCH-LinkUtility 把 `boot-chain.bin` 写到 `0x08000000`。

没有焊调试排针的 `wdap` 可以用芯片自带的 USB 下载模式：上电时拉高 BOOT0，电脑上出现 `4348:55E0`，用 MounRiver Studio 带的 WCHISPTool_CH32Vxxx（芯片 CH32V307，下载方式 USB，不开读保护）或 [wchisp](https://github.com/ch32-rs/wchisp)（`wchisp flash boot-chain.bin`）写入。

`linkw` 用芯片自带的 USB 下载模式：按住 BOOT 键插上 USB，电脑上出现 `1a86:55E0`，用 WCHISPTool_CH32Vxxx（芯片 CH32V208，下载方式 USB，不开读保护）写入。出厂的 WCH-LinkW 开着读保护，工具拒绝写入；先执行“解除代码保护”，这一步擦除 Flash 并让芯片退出下载模式，再按住 BOOT 重新插上 USB 后写入。

## 从旧版固件迁移

装着旧版单个 bootloader（地址 0，应用在 `0x00010000`）的板子不需要调试器：用 `dfu_update.py` 写入 `migrate-to-ab.elf.bin`，旧 bootloader 把它当作应用启动，它写入启动链后重启，新的 bootloader 停在 DFU 模式。这一步中途断电会使板子没有可用的 bootloader，只能按上一节重新写入 `boot-chain.bin`。设置区的位置不变，但 0.6 之前的设置格式不同，两块无线探针需要重新配对。

装着三段式启动（USB `1209:3070`）的 `v305` 用它自己的 `migrate-to-ab.elf.bin`：

```
python dfu_update.py --bootloader 1209:3070 --run-app migrate-to-ab.elf.bin
```

迁移镜像先写槽 B 并逐页校验，这期间旧的 stage1 和 bootloader 保持不变，失败时重启回旧 bootloader，可以再次执行；最后写 stage1，入口所在的一页最后修改，只有写这一页的几毫秒内断电需要用 WCH-Link 恢复。板上还是更早的应用（USB `0d28:2041`）时，按住 IAP 键上电，让三段式启动的 bootloader 停在 DFU 模式，再写迁移镜像。

`linkw` 没有迁移镜像。

## 写入应用和 bootloader

应用除 DAP 接口外还有一个 DFU runtime 接口。`dfu_update.py` 向它发送 DFU DETACH，探针重启进入 bootloader，然后经标准 USB DFU 1.1 写入镜像；bootloader 在下载结束时写入 seal 并启动新应用。Windows 上 bootloader 声明 WinUSB，不需要另装驱动。

DFU 模式下 bootloader 有两个接口：接口 0（`XR-DAP application`）写应用，接口 1（`XR-DAP bootloader slot A` 或 `... slot B`）写另一个引导槽。`--bootloader-dir` 指向含有 `bootloader-a.elf.bin` 和 `bootloader-b.elf.bin` 的目录（发布包的目录，或 `tools/build.sh` 输出的 `build/images/<preset>/`）。`dfu_update.py` 比较目录中那个槽的镜像版本和 USB 产品名中正在运行的版本，不同时先写 bootloader：写完槽记录后 bootloader 重启，stage1 启动新的 bootloader，然后写应用。版本相同时不写 bootloader，`--force-bootloader` 强制写入。两个槽都升级时执行两次，第二次加 `--force-bootloader`。

dfu-util 同样先发 DETACH。两个 DFU 接口的备用设置都是 0，命令按名字选择应用接口：

```
dfu-util -d 1d50:6199,1209:3072 -S XRobot-XRDAP-<UID> -a "XR-DAP application" -D xrdap.elf.bin
```

dfu-util 提示镜像没有 DFU 后缀，不影响写入。

## 看门狗与安全模式

应用开启独立看门狗，主循环约 8 s 没有运行即复位。连续三次看门狗复位后，应用以安全模式启动：不读写设置区，只作为有线探针工作，DFU 照常可用；正常运行 30 s 或重新上电后恢复。
