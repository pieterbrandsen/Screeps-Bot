# Structure Repair Part

## Overview

The Structure Repair Part is responsible for managing the repair of structures within the room. This includes identifying damaged structures, prioritizing repairs, and assigning creeps to repair tasks.

## Repair Prioritization

Repairs are prioritized based on the following factors:

1. **Structure Type**: Important structures (e.g., spawn points, extensions) are prioritized over less critical ones (e.g., roads).
2. **Hits**: Structures with lower hits are prioritized for repair.
3. **Room Needs**: The overall needs of the room (e.g., energy availability, creep capacity) may influence repair priorities.