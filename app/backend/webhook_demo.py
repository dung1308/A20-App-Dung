from fastapi import FastAPI, Request
import uvicorn

app = FastAPI(title="Admissions Staff Portal (Mock)")

@app.post("/handoff")
async def receive_handoff(request: Request):
    """
    This endpoint simulates the receiver for the Admissions Staff.
    In a real app, this would update a 'Live Dashboard' or send an email.
    """
    data = await request.json()
    
    print("\n" + "="*50)
    print(f"🚨 NEW HUMAN HANDOFF REQUEST AT {data.get('timestamp')}")
    print(f"Student ID: {data.get('user_id')}")
    print(f"Reason: {data.get('route')} (Judge: {data.get('judge_result')})")
    print("-" * 50)
    print("CONTEXT SUMMARY FOR STAFF:")
    print(data.get('handoff_summary'))
    print("="*50 + "\n")
    
    return {"status": "received", "notified_staff": True}

if __name__ == "__main__":
    # Run this on port 9000 as configured in HUMAN_WEBHOOK
    print("Admissions Staff Webhook Listener started on http://localhost:9000")
    print("Waiting for fallbacks from the main AI backend...")
    uvicorn.run(app, host="0.0.0.0", port=9000)