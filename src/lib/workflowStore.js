const seedAttendance = [
  { id: "a-1", employeeId: "e-1", employee: "Aarav Sharma", date: "2026-07-19", checkIn: "08:52", checkOut: "18:15", checkInAt: "2026-07-19T03:22:00.000Z", checkOutAt: "2026-07-19T12:45:00.000Z", durationSeconds: 33780, hours: "9h 23m", status: "On time", checkInLocation: { latitude: 28.6315, longitude: 77.2167, accuracy: 18 } },
  { id: "a-2", employeeId: "e-1", employee: "Aarav Sharma", date: "2026-07-18", checkIn: "09:12", checkOut: "18:00", checkInAt: "2026-07-18T03:42:00.000Z", checkOutAt: "2026-07-18T12:30:00.000Z", durationSeconds: 31680, hours: "8h 48m", status: "Late" },
  { id: "a-3", employeeId: "e-2", employee: "Neha Verma", date: "2026-07-19", checkIn: "09:03", checkOut: "13:03", checkInAt: "2026-07-19T03:33:00.000Z", checkOutAt: "2026-07-19T07:33:00.000Z", durationSeconds: 14400, hours: "4h 0m", status: "On time" }
];

const seedReports = [
  { id: "r-1", employeeId: "e-1", employee: "Aarav Sharma", date: "2026-07-19", hours: "5.5", task: "Fire Alarm Panel Check", workCompleted: "Fire alarm panel checked, 2 sensors replaced.", problems: "None", tomorrowPlan: "AC compressor replacement.", status: "Approved", managerComment: "Great turnaround." },
  { id: "r-2", employeeId: "e-2", employee: "Neha Verma", date: "2026-07-19", hours: "6", task: "Fiber Panel Installation", workCompleted: "Cabinet moved, cabling in progress.", problems: "Rack lock missing key.", tomorrowPlan: "Continue fiber termination.", status: "Submitted", managerComment: "" },
  { id: "r-3", employeeId: "e-3", employee: "Rohit Malhotra", date: "2026-07-19", hours: "1", task: "HVAC Filter Replacement", workCompleted: "Blocked at gate; awaiting access.", problems: "No site access.", tomorrowPlan: "Return after access approval.", status: "Needs Update", managerComment: "Add the site contact response." }
];

const seedExpenses = [
  { id: "x-1", employeeId: "e-1", employee: "Aarav Sharma", type: "Travel", amount: 420, date: "2026-07-19", note: "Cab to Sector 62 site", status: "Pending", managerComment: "" },
  { id: "x-2", employeeId: "e-1", employee: "Aarav Sharma", type: "Materials", amount: 1850, date: "2026-07-18", note: "Sensor replacements", status: "Approved", managerComment: "Receipt verified." },
  { id: "x-3", employeeId: "e-2", employee: "Neha Verma", type: "Meals", amount: 260, date: "2026-07-19", note: "Late site shift", status: "Pending", managerComment: "" }
];

const store = globalThis.fieldflowWorkflowStore || {
  attendance: seedAttendance,
  reports: seedReports,
  expenses: seedExpenses
};

globalThis.fieldflowWorkflowStore = store;
export default store;
