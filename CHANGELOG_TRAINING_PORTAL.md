# Nexus Browser Training Portal

Added the original browser experience back as the single workspace for Nexus development/training.

## Modes
- Chat
- Training
- Knowledge
- Issue Logs

## Training
- Paste a real Zendesk/support case
- Stage-based loading percentage
- Nexus analysis against Ticket Matrix
- Approve / Incorrect feedback
- Write and save a correction
- Learned-memory preview
- Official Ticket Matrix remains higher authority than learned memory

## Runtime
- llama.cpp is the local model provider
- Ollama is not required by the browser app
- Nexus remains on 127.0.0.1:8787
- llama.cpp remains on 127.0.0.1:8080
- DeerFlow is optional and can be connected later

## Future Zendesk
The browser trainer and Zendesk sidebar use the same Nexus backend, policy knowledge, learned memory, and logs.

## Queue + long Zendesk ticket reliability update
- Added a FIFO Nexus job queue so multiple trainers can submit cases safely.
- Browser shows queue position, elapsed wait time, and rolling estimated wait.
- Chat and Training both use the same queue.
- One local inference job runs at a time to protect VRAM/context stability.
- Training strips low-value Zendesk audit noise such as URLs, IP-only lines, webhook/client metadata, and playlist timestamps.
- QA specialist work is limited to two sequential specialists.
- QA tool routing is disabled for Matrix-only training reviews.
- QA review is capped to one verification pass to avoid repeated context overflow.
- llama.cpp output budget defaults to 1024 tokens per internal call.
- llama.cpp model ID is discovered automatically from /v1/models.
- START_ALL.bat now launches llama.cpp with a 16384 context.
