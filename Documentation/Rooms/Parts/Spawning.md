# Spawning Room Part

An room can spawn or request spawning elsewhere if it itself does not have spawns

## Queue

The spawning queue is managed by the room and will prioritize spawns based on the current needs of the room. If a creep is requested and there is enough energy and space, it will be spawned immediately. Otherwise, it will be added to the queue and spawned when resources become available.