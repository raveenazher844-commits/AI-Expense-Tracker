
const STORAGE_KEY = "spendwise_expenses_v1";

const form = document.getElementById("expenseForm");
const descriptionInput = document.getElementById("description");
const amountInput = document.getElementById("amount");
const categoryInput = document.getElementById("category");
const dateInput = document.getElementById("date");
const formMessage = document.getElementById("formMessage");
const expenseList = document.getElementById("expenseList");
const emptyTransactions = document.getElementById("emptyTransactions");
const categoryBreakdown = document.getElementById("categoryBreakdown");
const analyzeButton = document.getElementById("analyzeButton");
const aiResult = document.getElementById("aiResult");

const money = new Intl.NumberFormat("en-PK", {
    style: "currency",
    currency: "PKR",
    maximumFractionDigits: 2
});

function todayString() {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, "0");
    const day = String(today.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

dateInput.value = todayString();

function loadExpenses() {
    try {
        const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");

        if (!Array.isArray(saved)) return [];

        return saved.filter(item =>
            item &&
            typeof item.id === "string" &&
            typeof item.description === "string" &&
            typeof item.category === "string" &&
            typeof item.date === "string" &&
            Number.isFinite(item.amount) &&
            item.amount > 0
        );
    } catch {
        return [];
    }
}

let expenses = loadExpenses();

function saveExpenses() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(expenses));
        return true;
    } catch {
        formMessage.textContent =
            "Could not save expenses in this browser.";
        return false;
    }
}

function addTextCell(row, text, className = "") {
    const cell = document.createElement("td");
    cell.textContent = text;
    if (className) cell.className = className;
    row.appendChild(cell);
    return cell;
}

function renderExpenses() {
    const total = expenses.reduce((sum, item) => sum + item.amount, 0);
    const currentMonth = todayString().slice(0, 7);

    const monthlyTotal = expenses
        .filter(item => item.date.startsWith(currentMonth))
        .reduce((sum, item) => sum + item.amount, 0);

    document.getElementById("totalExpenses").textContent = money.format(total);
    document.getElementById("monthlyExpenses").textContent =
        money.format(monthlyTotal);
    document.getElementById("transactionCount").textContent =
        String(expenses.length);

    expenseList.replaceChildren();
    emptyTransactions.hidden = expenses.length > 0;

    const sorted = [...expenses].sort((a, b) =>
        b.date.localeCompare(a.date) || b.id.localeCompare(a.id)
    );

    sorted.forEach(item => {
        const row = document.createElement("tr");

        addTextCell(row, item.description);
        addTextCell(row, item.category);
        addTextCell(row, item.date);
        addTextCell(row, money.format(item.amount), "amount-cell");

        const actionCell = document.createElement("td");
        const deleteButton = document.createElement("button");
        deleteButton.type = "button";
        deleteButton.className = "delete-button";
        deleteButton.textContent = "Delete";
        deleteButton.setAttribute("aria-label", `Delete ${item.description}`);

        deleteButton.addEventListener("click", () => {
            expenses = expenses.filter(expense => expense.id !== item.id);
            saveExpenses();
            renderExpenses();
            formMessage.textContent = "Expense deleted.";
        });

        actionCell.appendChild(deleteButton);
        row.appendChild(actionCell);
        expenseList.appendChild(row);
    });

    renderBreakdown();
}

function renderBreakdown() {
    categoryBreakdown.replaceChildren();

    const totals = {};

    expenses.forEach(item => {
        totals[item.category] = (totals[item.category] || 0) + item.amount;
    });

    const categories = Object.entries(totals)
        .sort((a, b) => b[1] - a[1]);

    if (categories.length === 0) {
        const message = document.createElement("p");
        message.className = "empty-state";
        message.textContent = "Add an expense to see your spending.";
        categoryBreakdown.appendChild(message);
        return;
    }

    const largest = categories[0][1];

    categories.forEach(([category, amount]) => {
        const wrapper = document.createElement("div");
        wrapper.className = "category-row";

        const info = document.createElement("div");
        info.className = "category-info";

        const name = document.createElement("span");
        name.textContent = category;

        const value = document.createElement("span");
        value.textContent =
            `${money.format(amount)} · ${((amount / largest) * 100).toFixed(0)}%`;

        info.append(name, value);

        const track = document.createElement("div");
        track.className = "bar-track";

        const bar = document.createElement("div");
        bar.className = "bar-fill";
        bar.style.width = `${(amount / largest) * 100}%`;

        track.appendChild(bar);
        wrapper.append(info, track);
        categoryBreakdown.appendChild(wrapper);
    });
}

form.addEventListener("submit", event => {
    event.preventDefault();
    formMessage.textContent = "";

    const description = descriptionInput.value.trim();
    const amount = Number(amountInput.value);
    const category = categoryInput.value;
    const date = dateInput.value;

    if (!description || description.length > 200) {
        formMessage.textContent = "Enter a valid description.";
        return;
    }

    if (!Number.isFinite(amount) || amount <= 0 || amount > 1_000_000_000) {
        formMessage.textContent = "Enter a valid positive amount.";
        return;
    }

    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        formMessage.textContent = "Select a valid date.";
        return;
    }

    const expense = {
        id: crypto.randomUUID(),
        description,
        amount,
        category,
        date
    };

    expenses.unshift(expense);

    if (!saveExpenses()) {
        expenses = expenses.filter(item => item.id !== expense.id);
        return;
    }

    renderExpenses();
    form.reset();
    dateInput.value = todayString();
    formMessage.textContent = "Expense added successfully!";
});

document.getElementById("clearAll").addEventListener("click", () => {
    if (expenses.length === 0) {
        formMessage.textContent = "There are no expenses to clear.";
        return;
    }

    if (!window.confirm("Delete all recorded expenses?")) return;

    expenses = [];

    if (saveExpenses()) {
        renderExpenses();
        aiResult.textContent = "Your expenses have been cleared.";
        formMessage.textContent = "All expenses cleared.";
    }
});

analyzeButton.addEventListener("click", async () => {
    if (expenses.length === 0) {
        aiResult.textContent =
            "Please add at least one expense before requesting AI insights.";
        return;
    }

    analyzeButton.disabled = true;
    analyzeButton.textContent = "Analyzing your expenses...";
    aiResult.textContent = "Groq AI is analyzing your spending. Please wait...";

    try {
        const response = await fetch("/api/ai-insights", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ expenses })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.detail || "Could not generate insights.");
        }

        aiResult.textContent = data.insights;
    } catch (error) {
        aiResult.textContent =
            `AI analysis failed: ${error.message}\n\n` +
            "Check that the FastAPI server is running, your Groq API key is valid, and the selected model is available.";
    } finally {
        analyzeButton.disabled = false;
        analyzeButton.textContent = "✦ Analyze My Spending";
    }
});

renderExpenses();
