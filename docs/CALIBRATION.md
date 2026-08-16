# DMR Calibration Plan

`0.1.0-alpha7-dev` turns the existing calibration controls into a repeatable RX measurement workflow. The important rule remains unchanged: change **one variable at a time** and use repeatable transmissions.

Randomly sweeping RXOffset, TXOffset and levels together produces impressive-looking numbers and useless conclusions.

## Baseline

Before testing, preserve the current known baseline:

```text
RXOffset = 0 Hz
TXOffset = 0 Hz
RXLevel  = 50%
TXLevel  = 50%
RFLevel  = 100%
TXInvert = 1
RXInvert = 0
```

Use the WebUI **SAVE CALIBRATION BASELINE** control before changing values.

## RX comes first

The hotspot can objectively measure RF BER for:

```text
HT -> hotspot
```

That makes RXOffset the first calibration target.

Recommended test setup:

- use BrandMeister Parrot for repeatable voice tests
- keep the handheld on low power
- keep distance, orientation and location unchanged between runs
- make several 5-10 second transmissions per offset
- avoid touching RXLevel until RXOffset behavior is understood

## Alpha7-dev sample rule

The WebUI groups recorded calls by RXOffset and calculates:

```text
sample count
average BER
best BER
average RSSI
```

A single low-BER packet is **not** enough to produce the apply recommendation. The current target is:

```text
3 samples per RX offset
```

Until an offset has at least three samples, the UI may show it as a **provisional** best but will not enable **USE BEST RX OFFSET** for that group.

The recommended group is chosen primarily by the lowest average BER. Sample count and distance from zero are only tie-breakers; the software does not pretend those are additional RF quality measurements.

## Controlled RXOffset sequence

1. Save the calibration baseline.
2. Start a new calibration session.
3. Record at least three similar Parrot transmissions at RXOffset `0`.
4. Note average BER, best BER and RSSI context.
5. Change only RXOffset by a controlled step.
6. Repeat the same number and approximate length of transmissions.
7. Compare **average BER across repeated samples**, not one lucky packet.
8. Continue around the improving region until the minimum is bracketed.
9. Confirm the apparent best region with additional repeated tests.
10. Use **USE BEST RX OFFSET** only after the recommendation is supported by enough samples.
11. Only then consider RXLevel if BER is still poor.

Quick controls include ±100, ±250 and ±500 Hz changes. Each change still uses the normal configuration/apply path and restarts only the active RF stack as required.

## Manual confirmation remains mandatory

Alpha7-dev does not silently tune the modem.

When **USE BEST RX OFFSET** becomes available, it displays the recommended offset, sample count and average BER. Applying it requires an explicit browser confirmation, then uses the normal transactional config-save/config-apply flow.

There is deliberately no corresponding automatic TX recommendation because the hotspot cannot measure the receiving handheld's BER.

## CLI summary

The same aggregate view is available from the terminal:

```bash
ywd-hotspotctl calibration
```

The command may transparently request sudo because calibration/config data is stored in protected appliance paths.

Example shape:

```text
RX OFFSET    N   AVG BER   BEST BER   AVG RSSI
      -250    3    0.700%     0.300%      -53.0
         0    3    2.100%     1.600%      -53.0
```

An asterisk marks the current recommendation.

## Export results

Calibration data contains no BrandMeister password, API key or web-control password.

From the CLI:

```bash
sudo ywd-hotspotctl calibration export json > calibration.json
sudo ywd-hotspotctl calibration export csv  > calibration.csv
```

The WebUI also provides **EXPORT JSON** and **EXPORT CSV** buttons. JSON contains raw samples plus the calculated aggregates/recommendation; CSV contains the individual recorded samples for outside analysis.

## RSSI vs BER

RSSI is useful context but BER is the primary objective receive-quality measurement for this calibration. A strong-looking RSSI does not automatically mean the modem slicing/offset is optimal.

## RXLevel

Do not tune RXLevel merely because the control exists. First establish a repeatable RXOffset minimum. If BER remains unacceptable or behavior suggests level/slicer problems, change RXLevel separately and repeat the same controlled procedure.

## TX calibration is different

The hotspot cannot directly measure the handheld's receive BER for:

```text
hotspot -> HT
```

TXOffset/TXLevel therefore require evidence from the receiving side, such as:

- a handheld that displays useful BER/error information
- a second suitable receiver/instrument
- carefully controlled subjective playback when no better measurement exists

Do not mix TX conclusions into the RX BER table.

## Safety/stability during calibration

The project previously experienced one unexplained hard reboot/lock event during DMR testing. No root cause was proven.

During early calibration:

- use the HT at low power
- initially keep it roughly 10-15 ft from the Pi/HAT
- keep a ping running if practical
- watch uptime
- if the Pi reboots, inspect the previous persistent journal before doing more RF tests

Useful commands:

```bash
uptime
ping PI-IP
sudo journalctl --list-boots
sudo journalctl -b -1 -e
sudo journalctl -b -1 -k -e
vcgencmd get_throttled
```

If a test gets weird, restore the saved calibration baseline rather than trying to remember which knob got turned three experiments ago.
