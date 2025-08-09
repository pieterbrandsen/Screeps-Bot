# Workers

An creep will be defined as an Worker.

## Types

- Worker - A basic worker creep that can harvest energy and build structures.
- Hauler - A worker creep specialized in transporting energy and resources.
- Range Attacker - A worker creep that can attack from a distance.
- Melee Attacker - A worker creep that engages in close combat.
- Healer - A worker creep that can heal other creeps.

## Worker

An Worker can execute resource gather and usage [tasks](Tasks.md) with limited moving capabilities.
It can for example mine or upgrade with its energy.

### Typical Tasks

- Harvest nearby sources when energy is low.
- Build or repair structures requested by the room parts.
- Upgrade the controller when the Controller Upkeep part exposes jobs.

### Movement Logic

Workers are expected to operate any distance to their targets.

### Jobs and Room Interaction

The Resource Management room part distributes harvesting jobs to Workers. They
also consume jobs from Construction, Controller Upkeep or Structure Repairs
depending on the room state.

### Body Composition

Planned bodies favour `WORK` and `CARRY` parts with just enough `MOVE` parts to
have no fatigue when carrying nothing. Example: `WORK WORK CARRY MOVE MOVE`.

## Hauler

An Hauler can execute resource transportation tasks, moving energy and materials between structures.

### Typical Tasks

- Collect dropped resources or mine outputs.
- Refill spawns, extensions and towers as requested by the Resource Management part.
- Transport minerals or other resources to storage structures.

### Movement Logic

Haulers contain a higher ratio of MOVE parts to ensure they can travel long
distances even when fully loaded. They try to follow roads or cached paths to
reduce fatigue.

### Jobs and Room Interaction

Haulers mainly listen to requests from the Resource Management room part. They
deliver energy to wherever it is needed and may also shuttle resources from
remote mining outposts back to central storage.

### Body Composition

Planned bodies typically alternate `CARRY` and `MOVE` parts, for example:
`CARRY MOVE CARRY MOVE`. Longer distance routes may use larger bodies with a
2:1 `CARRY` to `MOVE` ratio.

## Range Attacker

An Range Attacker can execute ranged combat tasks on enemy creeps.

### Typical Tasks

- Defend owned rooms by attacking hostile creeps from a distance.
- Participate in assaults on enemy rooms together with melee attackers and healers.

### Movement Logic

Range Attackers try to keep distance from their target while staying within
attack range. They may kite backwards or circle around enemies to minimize
damage taken.

### Jobs and Room Interaction

They are spawned as part of the Defense room part or when a specific attack job
is created. Range Attackers may be assigned rally positions inside owned rooms or
move towards job waypoints when assaulting enemy territory.

### Body Composition

A common setup is a mix of `RANGED_ATTACK` and `MOVE` parts with a few `TOUGH`
parts up front. Example: `TOUGH MOVE RANGED_ATTACK MOVE`.

## Melee Attacker

An Melee Attacker can execute close combat tasks on enemy creeps.

### Typical Tasks

- Engage hostile creeps at melee range.
- Break through enemy ramparts or attack structures when ordered.

### Movement Logic

Melee Attackers need enough MOVE parts to close the distance quickly. They
charge straight toward the target or follow waypoints supplied by a job.

### Jobs and Room Interaction

They work closely with the Defense room part or Assault jobs. Melee Attackers
can be paired with Healers to sustain longer fights and may guard important room
objects when idle.

### Body Composition

A simple body uses `ATTACK`, `MOVE` and `TOUGH` parts. When intended to dismantle
structures a few `WORK` parts may be added. Example: `TOUGH ATTACK MOVE MOVE`.

## Healer

An Healer can execute healing tasks on itself and other creeps.

### Typical Tasks

- Heal injured friendly creeps during defense or assaults.
- Provide passive regeneration to nearby workers when hostile activity is low.

### Movement Logic

Healers keep up with the units they support. They often maintain a safe distance
behind melee attackers or range attackers, moving only as far as necessary to
use the `HEAL` action.

### Jobs and Room Interaction

Healers respond to Defense or Assault jobs and may be requested by specific room
parts when heavy fighting is expected. When idle they remain near the spawn to
reduce travel time to new tasks.

### Body Composition

Typical compositions prioritize `HEAL` and `MOVE` parts. Some `TOUGH` parts can
be added to survive focus fire. Example: `TOUGH MOVE HEAL MOVE`.
