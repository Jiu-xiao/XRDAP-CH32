// SPDX-License-Identifier: Apache-2.0
#include "status_led.hpp"

#include "timebase.hpp"

namespace XrDap
{

namespace
{

static_assert(Board::kLed.has_value(), "StatusLed drives the board's LED (Board::kLed)");

uint32_t NowMs() { return static_cast<uint32_t>(LibXR::Timebase::GetMilliseconds()); }

}  // namespace

StatusLed::StatusLed(const Probe& probe)
    : probe_(probe),
      led_(Board::kLed->pin.Port(), Board::kLed->pin.Mask()),
      rule_(NowMs())
{
  Write(false);
}

bool StatusLed::Poll()
{
  const uint32_t now = NowMs();
  const Light::Link link =
      probe_.UsbConfigured() ? Light::Link::WIRED : Light::Link::NONE;
  const Light::Frame frame =
      rule_.Update(link, Light::Setting::NONE, probe_.Activity().Read(now), now);
  Write(link == Light::Link::WIRED && Light::LitOnOff(frame));
  return false;
}

void StatusLed::Write(bool lit) { led_.Write(lit == Board::kLed->active_high); }

}  // namespace XrDap
