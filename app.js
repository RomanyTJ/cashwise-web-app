
// Variables and data initialization
let deferredPrompt;
let carryForwardBalances = JSON.parse(localStorage.getItem('carryForwardBalances') || '{}');
let monthlyBudgets = JSON.parse(localStorage.getItem('monthlyBudgets') || '{}');
let monthlyNotes = JSON.parse(localStorage.getItem('monthlyNotes') || '{}');
let savingsGoals = JSON.parse(localStorage.getItem('savingsGoals') || '[]');
let transactionCounter = parseInt(localStorage.getItem('transactionCounter') || '0');
let accountList = JSON.parse(localStorage.getItem('accountList') || '["Cash at Home", "Cash with Spouse", "Bank 1", "Bank 2"]');
let recurringIncome = JSON.parse(localStorage.getItem('recurringIncome') || '[]');
let incomeTransactions = [];

// --- Functions ---

function updateAccountSelectors() {
  const selects = document.querySelectorAll('.income-source, .expense-source');
  selects.forEach(select => {
    select.innerHTML = accountList.map(a => `<option value="${a}">${a}</option>`).join('');
  });
}

function addAccount(type) {
  const name = prompt(`Enter name for new ${type} account:`);
  if (!name) return;
  if (!accountList.includes(name)) {
    accountList.push(name);
    localStorage.setItem('accountList', JSON.stringify(accountList));
    updateAccountSelectors();
    renderAccountButtons();
  }
}

function renderAccountButtons() {
  const container = document.getElementById('account-buttons');
  if (!container) return;
  container.innerHTML = '';

  const addCashBtn = document.createElement('button');
  addCashBtn.textContent = '➕ Add Cash Account';
  addCashBtn.onclick = () => addAccount('Cash');
  container.appendChild(addCashBtn);

  const addBankBtn = document.createElement('button');
  addBankBtn.textContent = '🏦 Add Bank Account';
  addBankBtn.onclick = () => addAccount('Bank');
  container.appendChild(addBankBtn);
}

function exportToExcel() {
  let csv = 'Category,Amount\n';
  const currentMonth = document.getElementById('monthKey').value || Object.keys(monthlyBudgets).pop();
  const data = monthlyBudgets[currentMonth];
  if (!data) {
    alert('No data available to export.');
    return;
  }

  for (const [k, v] of Object.entries(data.budgetMap || {})) {
    csv += `${k},${v}\n`;
  }

  for (const [k, v] of Object.entries(data.expenseMap || {})) {
    csv += `${k} (spent),${v}\n`;
  }

  for (const [k, v] of Object.entries(data.accountBalances || {})) {
    csv += `${k} Balance,${v}\n`;
  }

  const blob = new Blob([csv], { type: 'text/csv' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.setAttribute('hidden', '');
  a.setAttribute('href', url);
  a.setAttribute('download', `${currentMonth}_Cashwise_Export.csv`);
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

function renderGraphs() {
  const chartContainer = document.getElementById('chart-container');
  if (!chartContainer) return;

  const view = prompt('Select view: 1-Monthly, 2-Quarterly, 3-Annual')?.trim();
  const viewType = view === '1' ? 'monthly' : view === '2' ? 'quarterly' : 'annual';

  const months = Object.keys(monthlyBudgets);
  const groupData = {};

  months.forEach(month => {
    const data = monthlyBudgets[month];
    const income = data.income || 0;
    const key = viewType === 'quarterly' ? month.slice(0, 4) + '-Q' + Math.ceil(parseInt(month.slice(5, 7)) / 3) : viewType === 'monthly' ? month : 'Annual';
    if (!groupData[key]) groupData[key] = { income: 0, categories: {} };
    groupData[key].income += income;
    const categories = Object.assign({}, data.expenseMap);
    for (const [cat, amount] of Object.entries(categories)) {
      if (!groupData[key].categories[cat]) groupData[key].categories[cat] = 0;
      groupData[key].categories[cat] += amount;
    }
    groupData[key].categories['Tithe'] = (groupData[key].categories['Tithe'] || 0) + (data.budgetMap?.Tithe || 0);
    groupData[key].categories['Savings'] = (groupData[key].categories['Savings'] || 0) + (data.budgetMap?.Savings || 0);
  });

  chartContainer.innerHTML = '';

  for (const [label, { income, categories }] of Object.entries(groupData)) {
    const canvas = document.createElement('canvas');
    canvas.id = `chart_${label}`;
    chartContainer.appendChild(canvas);

    const catLabels = Object.keys(categories);
    const catData = catLabels.map(k => parseFloat(((categories[k] / income) * 100).toFixed(2)));

    new Chart(canvas, {
      type: 'pie',
      data: {
        labels: catLabels,
        datasets: [
          {
            label: `% of ${viewType} income`,
            data: catData,
            backgroundColor: catLabels.map((_, i) => `hsl(${(i * 45) % 360}, 70%, 60%)`)
          }
        ]
      },
      options: {
        responsive: true,
        plugins: {
          legend: { position: 'bottom' },
          title: {
            display: true,
            text: `${label} Spending as % of Income`
          }
        }
      }
    });
  }
}

function renderIncomeAnalysis() {
  gatherIncomeTransactions();
  if (incomeTransactions.length === 0) {
    alert('No income transactions found.');
    return;
  }

  const sources = [...new Set(incomeTransactions.map(tx => tx.category))];
  const months = [...new Set(incomeTransactions.map(tx => tx.month))].sort();

  const datasetMap = {};
  sources.forEach(source => {
    datasetMap[source] = months.map(month => {
      const monthTxns = incomeTransactions.filter(tx => tx.month === month && tx.category === source);
      return monthTxns.reduce((sum, tx) => sum + tx.amount, 0);
    });
  });

  const datasets = sources.map((source, idx) => ({
    label: source,
    data: datasetMap[source],
    borderColor: `hsl(${(idx * 60) % 360}, 70%, 50%)`,
    backgroundColor: `hsla(${(idx * 60) % 360}, 70%, 50%, 0.4)`,
    fill: true,
  }));

  const chartContainer = document.getElementById('chart-container');
  if (!chartContainer) return;
  chartContainer.innerHTML = '';
  const canvas = document.createElement('canvas');
  canvas.id = 'incomeAnalysisChart';
  chartContainer.appendChild(canvas);

  new Chart(canvas, {
    type: 'line',
    data: {
      labels: months,
      datasets: datasets
    },
    options: {
      responsive: true,
      plugins: {
        title: {
          display: true,
          text: 'Income Analysis by Source Over Time'
        },
        legend: {
          position: 'bottom'
        }
      },
      interaction: {
        mode: 'nearest',
        intersect: false
      },
      scales: {
        x: {
          display: true,
          title: { display: true, text: 'Month' }
        },
        y: {
          display: true,
          title: { display: true, text: 'Amount' }
        }
      }
    }
  });
}

function gatherIncomeTransactions() {
  incomeTransactions = [];
  Object.entries(monthlyBudgets).forEach(([month, data]) => {
    if (!data.transactions) return;
    data.transactions.forEach(tx => {
      if (tx.type === 'income') {
        incomeTransactions.push({ ...tx, month });
      }
    });
  });
}

// Remaining app functions are omitted here for brevity, but can be added as needed.
