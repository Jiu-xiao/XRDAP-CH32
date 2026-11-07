# 板子

[English](boards.en.md)

本文列出 XRDAP-CH32 支持的各块板子的引脚、按键、指示灯、主频和射频。所有板子的探针在电脑上都是 USB 设备 `1D50:6199`，DAP 包长 1024 字节；各板的 bcdDevice 不同（XRDAP-Core 的 `xrdap/probe/family.hpp`）。

## wdap

“高速无线 DAP 调试器”板：CH32V307RCT6，12 MHz 晶振，USB 高速，SX1281 射频模块，产品名 `XR-DAP-V307`。固件 `wdap` 跑在 216 MHz，`wdap-144` 跑在 144 MHz。

| 用途 | 位置 |
|---|---|
| SWCLK | 2×6 排针 3 脚（TCK_O，PB3） |
| SWDIO | 2×6 排针 4 脚（TMS_O，PB5） |
| 目标复位 | 2×6 排针 5 脚（RST_O，PC1） |
| 电源输出 | 2×6 排针 1 脚 3V3、7 脚 5V，目标自带电源时不接 |
| bootloader 键、配对键 | KEY2 |
| 状态灯 | 8 颗 WS2812B，数据线 PB15 |

状态灯按 XR-DAP 全系列共用的规则显示连接、无线、配对和 DAP 活动，规则见 XRDAP-Core README 的“状态灯”一节；上电时彩虹扫过一次。

射频的两档速率：高速率（默认）为 GFSK 2 Mb/s，每包最长 255 字节，一条 1024 字节的消息最多 5 包；低速率为 FLRC 1.3 Mb/s，每包最长 127 字节，一条消息分 9 包。配对和建立会话使用控制信道 F（2448.5 MHz），数据信道在 2402–2481 MHz 中选择。

芯片有 64 KB RAM：DAP 包数为 4（DAP_Info 报告），采样缓冲 4096 字节（厂商扩展的 INFO 报告）。

## v305

CH32V305 板，电路与 WCH-LinkE 相同：CH32V305FBP6，12 MHz 晶振，USB 高速，没有射频，产品名 `XR-DAP-V305`。固件 `v305` 跑在 216 MHz，`v305-144` 跑在 144 MHz。

| 用途 | 引脚 |
|---|---|
| SWCLK | PB13（板上连到 PA14） |
| SWDIO | PA9（封装内与 PA13 合封） |
| 目标复位 | PC8 |
| 指示灯 | PC9（封装内与 PA8 合封），低电平点亮 |
| bootloader 键 | IAP 键（S1），PC7 |
| 目标电源开关 | PA5（3V3）、PB12（5V），上电后保持低电平，即接通 |

QFN28 封装中 PA9 与 PA13 合封，板上 PB13 连到 PA14，所以目标的 SWD 线也连着芯片自己的调试口。应用启动时关闭 SWJ，PA13、PA14 保持输入，由 PA9、PB13 驱动目标；应用运行期间 WCH-Link 无法连接芯片，升级经 DFU 进行。板上的 ModeS 键（S2）接在晶振输出 PD1 上，按下会使晶振停振、USB 断开。

指示灯在 USB 已连接电脑时亮，DAP 通信时闪烁，没有连接时熄灭；bootloader 停在 DFU 模式时它闪烁。芯片有 32 KB RAM：DAP 包数为 2，采样缓冲 2048 字节。

## linkw

WCH-LinkW-R0-1v1：CH32V208GBU6，32 MHz 晶振，USB 全速，芯片自带 2.4 GHz 射频，产品名 `XR-DAP-V208`。应用跑在芯片标称的 144 MHz。

| 用途 | 位置 |
|---|---|
| SWCLK | JP1 2 脚，经 100 Ω 接 PA5 |
| SWDIO | JP1 4 脚，经 100 Ω 接 PA11 |
| 目标复位 | JP1 9 脚，PC8 |
| GND | JP1 6 脚 |
| 电源输出 | JP1 8 脚 3V3、10 脚 5V，开关为 PA0、PA1，上电后保持低电平 |
| bootloader 键、配对键 | ModeS，PA4 |
| 蓝灯、绿灯 | PC9、PC7，低电平点亮 |
| BOOT 键 | 芯片的 BOOT0，上电时按住进入芯片自带的 USB 下载模式 |

JP1 的 SWD 线与芯片的调试口 PA13、PA14 在同一网络上。应用启动时关闭 SWJ，由 PA5、PA11 驱动目标；应用运行期间 WCH-Link 无法连接芯片。

蓝灯的显示方式与 `v305` 的指示灯相同。绿灯在调试会话走无线时亮，配对进行中快闪。芯片没有高速 USB PHY，DAP 接口使用 EP1 OUT 和 EP2 IN 两个单向端点，包长同样是 1024 字节。固件按 32 KB RAM 链接：DAP 包数为 2，采样缓冲 2048 字节。

射频驱动是 `boards/linkw/v208_radio.hpp`。空中的包使用 BLE 的包格式，访问地址取这一对的链路地址，白化和 CRC 由硬件完成。高速率（默认）为 2M PHY，每包最长 251 字节，一条 1024 字节的消息最多 5 包；低速率为 1M PHY，每包最长 127 字节，一条消息最多 9 包。信道使用 BLE 的 2402–2480 MHz，间隔 2 MHz。

## SWD 时钟

SWD 由 GPIO 软件产生。请求的时钟不低于不加延时路径的速度时使用这条路径，其余请求在带延时的档位中取周期最接近的一档，实际时钟与请求相差不超过半档。各档按 CPU 周期标定，常数在各板的 `board.hpp`（`kSwdStepX10`、`kSwdInterceptX10`、`kSwdFastX10`）。
