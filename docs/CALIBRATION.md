# DMR Calibration Plan

Calibration is the next major engineering phase after `0.1.0-alpha5` passes UI/stability testing.

The important rule is to change **one variable at a time** and use repeatable transmissions. Randomly sweeping RXOffset, TXOffset and levels together produces impressive-looking numbers and useless conclusions.

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

Use the Alpha5 **SAVE CALIBRATION BASELINE** control before changing values.

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

## Controlled RXOffset sequence

1. Save the calibration baseline.
2. Start a new calibration session.
3. Record several transmissions at RXOffset `0`.
4. Note BER and RSSI for each observation.
5. Change only RXOffset by a controlled small step.
6. Repeat the same number/length of transmissions.
7. Compare repeatable BER, not a single lucky packet.
8. Continue around the improving region until the minimum is bracketed.
9. Confirm the best region with repeated tests.
10. Only then consider RXLevel if BER is still poor.

Alpha5 highlights the lowest observed BER but deliberately does not auto-apply a "best" value.

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
