# Screeps-Bot

A bot for playing the MMO strategy game Screeps. This repository will be used to write better C# code, as I will use the [Screeps C# API](https://github.com/thomasfn/ScreepsDotNet).

## Architecture

The bot is organised around a central controller that schedules jobs and manages workers. Individual rooms are monitored by system classes that react to the room's needs. Each tick follows a predictable flow that processes [Jobs](Documentation/Jobs/README.md), [Rooms](Documentation/Rooms/README.md) and [Workers](Documentation/Workers/README.md).

For additional design notes and more detail see the [Documentation](Documentation/README.md) directory.

## Getting Started

### Requirements

- .NET 8 or newer. You can install it from the [official .NET website](https://dotnet.microsoft.com/download).

### Clone and Build

```bash
WIP
```

## Project Structure

- `Documentation/` - Contains detailed documentation about the bot's architecture and subsystems.
- (future directories for source code will go here)

## Contributing

Contributions are welcome! Feel free to open issues or submit pull requests with improvements or bug fixes.
