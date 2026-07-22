export const employees = [
  { id: "e-1", name: "Aarav Sharma", department: "Field Operations", duty: "On Duty", tasks: 4, performance: 92 },
  { id: "e-2", name: "Neha Verma", department: "Installations", duty: "On Duty", tasks: 3, performance: 88 },
  { id: "e-3", name: "Rohit Malhotra", department: "Maintenance", duty: "On Break", tasks: 2, performance: 79 },
  { id: "e-4", name: "Simran Kaur", department: "Field Operations", duty: "Offline", tasks: 1, performance: 84 },
  { id: "e-5", name: "Vikram Rao", department: "Installations", duty: "Task Completed", tasks: 5, performance: 95 }
];
export const tasks = [
  { id: "t-101", title: "AC Compressor Replacement", employee: "Aarav Sharma", client: "Skyline Realty", address: "Sector 62, Noida", status: "In Progress", priority: "High", time: "Today · 10:30 AM" },
  { id: "t-102", title: "Fiber Panel Installation", employee: "Neha Verma", client: "NovaTech Labs", address: "Cyber Hub, Gurugram", status: "On The Way", priority: "Urgent", time: "Today · 11:15 AM" },
  { id: "t-103", title: "UPS Battery Audit", employee: "Aarav Sharma", client: "GreenCare Hospitals", address: "Sector 15, Faridabad", status: "Assigned", priority: "Medium", time: "Today · 2:00 PM" },
  { id: "t-104", title: "POS Terminal Setup", employee: "Vikram Rao", client: "MetroMart Retail", address: "Rajouri Garden, Delhi", status: "Completed", priority: "Low", time: "Yesterday" },
  { id: "t-105", title: "HVAC Filter Replacement", employee: "Rohit Malhotra", client: "Skyline Realty", address: "Sector 62, Noida", status: "Blocked", priority: "High", time: "Today · 12:00 PM" }
];
export const expenses = [{ employee: "Aarav Sharma", type: "Travel", amount: 420, status: "Pending" }, { employee: "Neha Verma", type: "Meals", amount: 260, status: "Pending" }, { employee: "Vikram Rao", type: "Tools", amount: 3200, status: "Approved" }];
