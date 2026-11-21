# Simulator models by topic

For each topic: what to simulate, the time step, what the learner edits, what the chart shows, and failures worth staging. Reproduce the real error text of the target framework.

## RTOS (implemented: `src/kernel.js`)
State: tasks with priority, stack and state; ready and delayed lists; queues, semaphores, mutexes with inheritance, timers, ISRs; 1 or 2 cores. Step 1 ms (one tick). Learner edits task bodies, priorities, stacks, object parameters. Chart: one row per task (running, ready, blocked), idle row, GPIO rows. Failures: watchdog from a spinning task, stack overflow, lost update, deadlock, priority inversion, queue overflow, blocking call in an ISR.

## Interrupts
State: interrupt sources with enable, pending and priority bits; a main context and ISR contexts; shared variables; a latency budget. Step 1 to 10 µs. Learner edits ISR bodies, what is deferred to a task, critical sections, `volatile`, debouncing, edge or level trigger. Chart: IRQ line, pending flag, ISR execution, main context, latency markers. Failures: ISR too long so the next edge is missed, shared variable torn between ISR and main, switch bounce counted five times, flag cleared too late so the ISR re-enters, flash access from an ISR.
ESP-IDF surface: `gpio_install_isr_service`, `gpio_isr_handler_add`, `IRAM_ATTR`, `xQueueSendFromISR`, `portYIELD_FROM_ISR`.

## Timers and PWM
State: counter, prescaler, auto-reload, compare channels, direction, update and compare events, capture register. Step one timer clock tick (scale the clock down so a period is 100 to 1000 steps). Learner edits prescaler, period, duty, alarm value, reload mode, callback body. Chart: the counter as a sawtooth, compare thresholds, the output pin, event markers. Failures: period off by one (reload N versus N-1), duty resolution lost to a prescaler that is too high, glitch when duty changes mid-period without shadow registers, 16-bit overflow in a measurement, work done in the alarm callback.
ESP-IDF surface: `gptimer_new_timer`, `gptimer_set_alarm_action`, `ledc_timer_config`, `ledc_set_duty` and `ledc_update_duty`, `mcpwm`, `esp_timer`.

## UART
State: TX and RX shift registers, line level per bit time, FIFOs, a ring buffer, baud generators on both ends, flow-control lines. Step one sixteenth of a bit (or one bit for higher stages). Learner edits baud, frame format, buffer sizes, the reader task (polling, events, pattern detection), flow control. Chart: TX and RX waveforms with decoded bytes above them, FIFO fill level, error flags. Failures: baud mismatch gives garbage or framing errors, RX FIFO overflow while the reader is busy, a message split across two reads, a printf from two tasks interleaved, blocking forever on a read with no timeout.
ESP-IDF surface: `uart_param_config`, `uart_driver_install`, `uart_read_bytes` with a timeout, the UART event queue (`UART_FIFO_OVF`, `UART_BUFFER_FULL`, `UART_FRAME_ERR`).

## I2C
State: SDA and SCL as wired-AND lines with pull-ups, controller and target state machines, addresses, ACK, clock stretching. Step a quarter of an SCL period. Learner builds transactions (start, address + R/W, bytes, repeated start, stop), sets speed and timeouts, adds a mutex when two tasks share the bus. Chart: SCL and SDA with decoded start, address, ACK or NACK, data and stop, as a logic analyzer shows them. Failures: wrong address gets a NACK, missing repeated start resets the register pointer, read of N bytes without the final NACK, bus stuck low after a reset mid-byte, two tasks interleaving transactions, pull-ups too weak for 400 kHz.
ESP-IDF surface: `i2c_new_master_bus`, `i2c_master_bus_add_device`, `i2c_master_transmit_receive`, `ESP_ERR_TIMEOUT`, `ESP_ERR_INVALID_RESPONSE`.

## SPI
State: SCLK, MOSI, MISO, CS per device, mode (CPOL, CPHA), shift registers, a transaction queue, optional DMA. Step half an SCLK period. Learner edits mode, clock speed, CS timing, transaction lengths, bus sharing, polling versus queued transactions. Chart: four lines with sampled bits marked on the sampling edge and decoded bytes. Failures: wrong mode shifts every byte by one bit, CS released between command and data, clock too fast for the device, two devices selected at once, DMA buffer on the stack or not word-aligned.
ESP-IDF surface: `spi_bus_initialize`, `spi_bus_add_device`, `spi_device_polling_transmit`, `spi_device_queue_trans`.

## CAN (TWAI)
State: nodes on a wired-AND bus, bitwise arbitration, frames with ID, DLC, CRC and ACK slot, error counters and states, acceptance filters. Step one bit. Learner edits bit timing, IDs and priorities, filters, TX queue length, bus-off recovery. Chart: bus level with decoded fields, per-node TX attempts, arbitration loss, error counters. Failures: no ACK with one node on the bus, bit-timing mismatch produces error frames, a chatty low-ID node starves others, bus-off after a fault and no recovery code, filter set too narrow.
ESP-IDF surface: `twai_driver_install`, `twai_transmit`, `twai_receive`, `twai_read_alerts`, `twai_initiate_recovery`.

## ADC and sampling
State: an analog source as a fixed function of time, sample-and-hold, resolution, attenuation, noise from a fixed table, a sample buffer. Step one sample period or less. Learner edits sample rate, attenuation, averaging, oneshot versus continuous with DMA, the filter. Chart: the analog signal, the sample points, the reconstructed signal. Failures: aliasing, clipping from the wrong attenuation, raw counts used without calibration, sampling jitter from a task-timed loop, buffer overrun in continuous mode.
ESP-IDF surface: `adc_oneshot_read`, `adc_continuous_start`, `adc_cali_raw_to_voltage`.

## Low power
State: power modes with current per mode, wake sources, peripheral clock gates, a battery budget in mAh. Step 1 ms with long tests summarised. Learner edits when to sleep, wake sources, what stays powered, the duty cycle. Chart: current over time (log scale) and mode. Failures: a peripheral keeps the chip awake, wake reason not checked, state lost in deep sleep, a polling loop defeating tickless idle.
ESP-IDF surface: `esp_sleep_enable_timer_wakeup`, `esp_deep_sleep_start`, `esp_sleep_get_wakeup_cause`, `RTC_DATA_ATTR`, power-management locks.

## Choosing the time step
Pick the largest step at which the bug you want to teach is still visible. Task-level topics: 1 ms. Bus protocols: a fraction of a bit. Timers: one counter tick. Keep a test between 500 and 5000 steps so the chart is readable without zoom.
