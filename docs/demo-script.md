# Demo script

1. Start the mock portal and the FastAPI service.
2. Load the built extension in developer mode and open the synthetic reimbursement portal.
3. Open Nayan. Explain that raw pixels are marked local-only and never pass to the transport API.
4. Start the supplied reimbursement task. Show the local-redaction count and safe status.
5. Inspect the sanitized context panel: values are placeholders, not source values.
6. Approve the local confirmation for submit. The planner returns a constrained click, the browser validates it again, and the portal reaches its success state.
7. Run the evaluation command and show the dashboard’s generated result file.
