# Start the AGRI-PC edge hub (run from the agribot-edge folder).
# First time:  py -m venv .venv ; .\.venv\Scripts\Activate.ps1 ; pip install -r requirements.txt
.\.venv\Scripts\Activate.ps1
uvicorn app.main:app --host 0.0.0.0 --port 8000
