# T23 — Performance และ Capacity Scenarios

วันที่: 12 พฤศจิกายน 2026  
สถานะ: documented limits และ **สมมติฐานเชิงคณิตศาสตร์ ไม่ใช่ benchmark, SLA หรือคำแนะนำขนาดเครื่อง**

## ข้อมูลจากเอกสาร

[Gotenberg 9.x production guide](https://gotenberg.dev/docs/operate/production) อธิบาย concurrency/queue และการ scale หลาย instances; [limits](https://gotenberg.dev/docs/operate/limits) ระบุ API timeout รวมเวลารอ queue และ queue/body limits ที่ตั้งได้ ค่า defaults เป็นของเอกสารเวอร์ชันนั้น ไม่ใช่ capacity ที่วัดในโครงการ หรือการรับรองว่าแต่ละงานใช้ทรัพยากรเท่ากัน

## สมมติฐานสำหรับ sensitivity analysis

สูตรอย่างง่าย: `offered_load = requests_per_hour × assumed_seconds_per_request / 3600`; `utilization = offered_load / assumed_concurrent_slots` ใช้เปรียบเทียบ **steady-state average** เท่านั้น ไม่ทำนาย burst, p95, queue wait, retries, memory หรือ failure

| Scenario | คำขอ/ชั่วโมง สมมติ | เวลางาน วินาที สมมติ | Slots สมมติ | Offered load | Utilization เชิงสมมติ |
| --- | ---: | ---: | ---: | ---: | ---: |
| Small | 30 | 2 | 1 | 0.0167 | 1.67% |
| Medium | 300 | 5 | 2 | 0.4167 | 20.83% |
| Medium ช้าลง | 300 | 10 | 2 | 0.8333 | 41.67% |

ข้อมูล machine-readable อยู่ [capacity assumptions](../../../research/specimens/capacity-assumptions.json) ตัวเลขเป็นตัวอย่างคณิตศาสตร์ ไม่ใช่ throughput ของ Gotenberg; แม้ utilization ต่ำก็ยังล้มเหลวจาก bursts, memory, network หรือ reports ที่ใหญ่ได้

## ความไม่แน่นอนและ future measurement

Unknown/not-tested: actual throughput, p50/p95 latency, queue wait, render time distribution, peak RAM, scaling efficiency และความสัมพันธ์กับ page count/font/assets บันทึก image digest, actual Chromium/fonts, hardware, CPU/memory limits, warm-up, repetitions, sample count, input distribution และ raw errors เมื่อมี environment เหมาะสมภายหลัง

ติดตาม queue wait แยกเวลา Render เมื่อ instrumentation ทำได้; ตรวจ correctness ของ outputs ควบคู่ ไม่ถือ request ที่ได้ PDF ไม่ครบเป็น performance success ไม่ใช้สมมติฐานเหล่านี้เลือก hardware หรือกำหนด SLA โดยอัตโนมัติ
