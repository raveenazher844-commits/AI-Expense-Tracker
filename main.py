
import os
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from groq import Groq
from pydantic import BaseModel, Field

BASE_DIR = Path(__file__).resolve().parent
PUBLIC_DIR = BASE_DIR / "public"

load_dotenv(BASE_DIR / ".env")

app = FastAPI(title="AI Expense Tracker")

app.mount(
    "/static",
    StaticFiles(directory=str(PUBLIC_DIR)),
    name="static"
)


class Expense(BaseModel):
    amount: float = Field(gt=0, le=1_000_000_000)
    category: str = Field(min_length=1, max_length=50)
    description: str = Field(default="", max_length=200)
    date: str = Field(min_length=10, max_length=10)


class InsightsRequest(BaseModel):
    expenses: list[Expense] = Field(max_length=500)


@app.get("/")
def home():
    return FileResponse(PUBLIC_DIR / "index.html")


@app.get("/api/health")
def health():
    return {"status": "ok", "app": "AI Expense Tracker"}


@app.post("/api/ai-insights")
def ai_insights(request: InsightsRequest):
    api_key = os.getenv("GROQ_API_KEY")
    model = os.getenv(
        "GROQ_MODEL",
        "llama-3.3-70b-versatile"
    )

    if not api_key or api_key == "PASTE_YOUR_GROQ_API_KEY_HERE":
        raise HTTPException(
            status_code=500,
            detail="Groq API key missing. Add it to your .env file."
        )

    if not request.expenses:
        raise HTTPException(
            status_code=400,
            detail="Please add some expenses before requesting AI insights."
        )

    total = sum(item.amount for item in request.expenses)

    category_totals = {}
    for item in request.expenses:
        category_totals[item.category] = (
            category_totals.get(item.category, 0) + item.amount
        )

    expense_data = [
        {
            "amount": item.amount,
            "category": item.category,
            "description": item.description,
            "date": item.date
        }
        for item in request.expenses
    ]

    prompt = f"""
You are a friendly personal budgeting assistant.

Analyze the user's expense data below.

Total recorded expenses: {total:.2f}
Category totals: {category_totals}
Expense records: {expense_data}

Provide:
1. A short summary of spending.
2. The biggest spending category.
3. Three realistic money-saving suggestions.
4. One simple budgeting tip for next month.

Be supportive, practical, and clear.
Do not invent income, savings, or financial facts.
Mention that the analysis is based only on the supplied expenses.
Do not present this as professional financial advice.
Use readable headings and bullet points.
"""

    try:
        client = Groq(api_key=api_key)
        response = client.chat.completions.create(
            model=model,
            messages=[
                {
                    "role": "system",
                    "content": "You are an accurate personal expense analysis assistant."
                },
                {
                    "role": "user",
                    "content": prompt
                }
            ],
            temperature=0.4,
            max_tokens=800
        )

        answer = response.choices[0].message.content

        return {
            "insights": answer or "No insights were returned.",
            "total_expenses": round(total, 2),
            "category_totals": {
                key: round(value, 2)
                for key, value in category_totals.items()
            }
        }

    except Exception as exc:
        print("Groq API error:", str(exc))
        raise HTTPException(
            status_code=502,
            detail="Groq could not generate insights. Check your model, API key, internet connection, and terminal error."
        )
