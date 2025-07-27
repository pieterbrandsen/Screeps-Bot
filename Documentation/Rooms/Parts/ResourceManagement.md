# Resource Management Part

## Types

- **Owned** - Resources in an Owned room
- **Remote Mining** - Resources in a Remote Mining room

## Owned

If there is central storage capacity it will always request energy from Sources with high priority jobs. This energy can be then distributed based on own requests.

If there is no central storage it can request energy from any available Source to mine itself. If there are more mining spaces requested then available it will get an dedicated miner.

## Remote Mining

An remote mining room will always keep its jobs active as long as it can be mined. It will request creeps if there is demand for the energy it can mine.