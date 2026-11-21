# Unverified facts

Checked on 2026-11-21 against the ESP-IDF v5.0 to v5.5 sources and the v5.3 Programming Guide. Nothing is open.

Corrected in the game:
- `esp_task_wdt_reconfigure()` exists from v5.0.1 (not in v5.0.0). Stage 14.
- A flash write on a dual-core ESP32 pauses all other tasks, not only those that need flash. Stage 14.
- The main-task affinity setting is `CONFIG_ESP_MAIN_TASK_AFFINITY_CPU0` (default). Stage 13.
- "One aligned 32-bit word is atomic" had no primary source; replaced by the documented rule (only atomic operations such as compare-and-set are safe without a lock). Stage 13.

Confirmed as written: task watchdog defaults, stack sizes in bytes, `heap_caps_get_largest_free_block()`, mutex and binary semaphore start states, priority inheritance on mutexes only and without chains, `configMAX_PRIORITIES` 25, `vTaskList()` config options, one scheduler over both cores, single-core targets, `xTaskCreatePinnedToCore` arguments, the Mars Pathfinder summary.

Rules for future text: do not call the Pathfinder lock an "information bus mutex" (JPL names the select() mutex); do not claim that taking a mutex from an ISR asserts (only a give from an ISR does, and only when the mutex has a holder).
