export const managerEmployees = [
  { id: "e-1", name: "Aarav Sharma", email: "aarav@fieldflow.app", department: "Field Operations", duty: "On Duty", tasks: 4, performance: 92, avatar: "https://i.pravatar.cc/96?img=12" },
  { id: "e-2", name: "Neha Verma", email: "neha@fieldflow.app", department: "Installations", duty: "On Duty", tasks: 3, performance: 88, avatar: "https://i.pravatar.cc/96?img=47" },
  { id: "e-3", name: "Rohit Malhotra", email: "rohit@fieldflow.app", department: "Maintenance", duty: "On Break", tasks: 2, performance: 79, avatar: "https://i.pravatar.cc/96?img=11" },
  { id: "e-4", name: "Simran Kaur", email: "simran@fieldflow.app", department: "Field Operations", duty: "Offline", tasks: 1, performance: 84, avatar: "https://i.pravatar.cc/96?img=44" },
  { id: "e-5", name: "Vikram Rao", email: "vikram@fieldflow.app", department: "Installations", duty: "Task Completed", tasks: 5, performance: 95, avatar: "https://i.pravatar.cc/96?img=68" },
  { id: "e-6", name: "Anjali Nair", email: "anjali@fieldflow.app", department: "Maintenance", duty: "On Duty", tasks: 3, performance: 87, avatar: "https://i.pravatar.cc/96?img=32" },
  { id: "e-7", name: "Karan Singh", email: "karan@fieldflow.app", department: "Repairs", duty: "Offline", tasks: 2, performance: 82, avatar: "https://i.pravatar.cc/96?img=15" },
  { id: "e-8", name: "Meera Joshi", email: "meera@fieldflow.app", department: "Repairs", duty: "On Leave", tasks: 0, performance: 90, avatar: "https://i.pravatar.cc/96?img=45" }
];

export const managerTasks = [
  { id: "t-1", title: "Refrigeration Unit Check", employee: "Aarav Sharma", employeeId: "e-1", client: "Urban Grocers", address: "Warehouse 12", status: "Assigned", priority: "Medium" },
  { id: "t-2", title: "Diesel Generator Audit", employee: "Aarav Sharma", employeeId: "e-1", client: "GreenCare Hospitals", address: "Wing B", status: "Assigned", priority: "Low" },
  { id: "t-3", title: "Fiber Panel Installation", employee: "Neha Verma", employeeId: "e-2", client: "NovaTech Labs", address: "Building A", status: "On The Way", priority: "Urgent" },
  { id: "t-4", title: "AC Compressor Replacement", employee: "Aarav Sharma", employeeId: "e-1", client: "Skyline Realty", address: "Tower 3", status: "In Progress", priority: "High" },
  { id: "t-5", title: "Networking Rack Setup", employee: "Anjali Nair", employeeId: "e-6", client: "NovaTech Labs", address: "Building A", status: "In Progress", priority: "High" },
  { id: "t-6", title: "POS Terminal Setup", employee: "Vikram Rao", employeeId: "e-5", client: "MetroMart Retail", address: "Store 08", status: "Completed", priority: "Low" },
  { id: "t-7", title: "Fire Alarm Panel Check", employee: "Aarav Sharma", employeeId: "e-1", client: "Urban Grocers", address: "Warehouse 12", status: "Completed", priority: "Medium" },
  { id: "t-8", title: "HVAC Filter Replacement", employee: "Rohit Malhotra", employeeId: "e-3", client: "Skyline Realty", address: "Tower 3", status: "Blocked", priority: "High" }
];

export const managerReports = [
  { id: "r-1", employee: "Aarav Sharma", employeeId: "e-1", date: "2026-07-19", hours: "5.5h", task: "Fire Alarm Panel Check", note: "Fire alarm panel checked, 2 sensors replaced.", issue: "None", tomorrow: "AC compressor replacement.", status: "Approved" },
  { id: "r-2", employee: "Neha Verma", employeeId: "e-2", date: "2026-07-19", hours: "6h", task: "Fiber Panel Installation", note: "Cabinet moved, cabling in progress.", issue: "Rack lock missing key.", tomorrow: "Continue fiber termination.", status: "Submitted" },
  { id: "r-3", employee: "Vikram Rao", employeeId: "e-5", date: "2026-07-19", hours: "4h", task: "POS Terminal Setup", note: "POS terminals live; UAT signed by client.", issue: "None", tomorrow: "Retail store 09 setup.", status: "Approved" },
  { id: "r-4", employee: "Rohit Malhotra", employeeId: "e-3", date: "2026-07-19", hours: "1h", task: "HVAC Filter Replacement", note: "Blocked at gate; awaiting access.", issue: "No site access.", tomorrow: "Return after access approval.", status: "Needs Update" }
];

export const attendanceRows = [
  { id: "a-1", employee: "Aarav Sharma", employeeId: "e-1", date: "2026-07-19", checkIn: "08:52", checkOut: "18:15", hours: "8.5h", status: "On time" },
  { id: "a-2", employee: "Aarav Sharma", employeeId: "e-1", date: "2026-07-18", checkIn: "09:12", checkOut: "18:00", hours: "8h", status: "Late" },
  { id: "a-3", employee: "Aarav Sharma", employeeId: "e-1", date: "2026-07-17", checkIn: "08:48", checkOut: "17:50", hours: "8.2h", status: "On time" },
  { id: "a-4", employee: "Neha Verma", employeeId: "e-2", date: "2026-07-19", checkIn: "09:03", checkOut: "—", hours: "4h", status: "On time" },
  { id: "a-5", employee: "Rohit Malhotra", employeeId: "e-3", date: "2026-07-19", checkIn: "08:44", checkOut: "—", hours: "3.4h", status: "On time" }
];

export const managerExpenses = [
  { id: "x-1", employee: "Aarav Sharma", type: "Travel", amount: 420, date: "2026-07-19", note: "Client site travel", status: "Pending" },
  { id: "x-2", employee: "Neha Verma", type: "Meals", amount: 260, date: "2026-07-19", note: "Late site shift", status: "Pending" },
  { id: "x-3", employee: "Vikram Rao", type: "Tools", amount: 3200, date: "2026-07-18", note: "Crimping tool replacement", status: "Approved" },
  { id: "x-4", employee: "Rohit Malhotra", type: "Fuel", amount: 900, date: "2026-07-18", note: "Service vehicle fuel", status: "Rejected" }
];

export const activity = [
  { color: "bg-emerald-500", person: "Vikram Rao", action: "completed", detail: "POS Terminal Setup", time: "5m ago" },
  { color: "bg-blue-500", person: "Neha Verma", action: "started", detail: "Fiber Panel Installation", time: "22m ago" },
  { color: "bg-rose-500", person: "Rohit Malhotra", action: "blocked", detail: "HVAC Filter Replacement", time: "40m ago" },
  { color: "bg-blue-500", person: "Anjali Nair", action: "checked in", detail: "Cyber Hub, Gurugram", time: "1h ago" },
  { color: "bg-amber-500", person: "Aarav Sharma", action: "submitted expense", detail: "₹420 · Travel", time: "1h ago" }
];
