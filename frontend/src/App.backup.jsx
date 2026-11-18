import { useEffect, useMemo, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
} from "recharts";
import jsPDF from "jspdf";

const API_URL = "http://localhost:5000/api/sensors";

const THRESHOLDS = {
  ph: { min: 6.5, max: 8.5 },
  turbidity: { max: 5 },
  chlorine: { min: 0.5 },
  temperature: { max: 35 },
  tds: { max: 500 },
  flowRate: { min: 80, max: 150 },
};

const DEMO_USERS = [
  { username: "admin", password: "aquaguard123", role: "admin", name: "System Admin" },
  { username: "operator", password: "operator123", role: "operator", name: "Plant Operator" },
];

const PLANTS = [
  { id: "plant-a", name: "Chennai Treatment Plant", location: "Chennai", capacity: "20 MLD" },
  { id: "plant-b", name: "ECR Pilot Plant", location: "ECR", capacity: "10 MLD" },
  { id: "plant-c", name: "Campus Demo Plant", location: "SRM Campus", capacity: "5 MLD" },
];

const PARAMS = [
  { key: "ph", label: "pH", unit: "", icon: "💧" },
  { key: "turbidity", label: "Turbidity", unit: "NTU", icon: "🌊" },
  { key: "chlorine", label: "Chlorine", unit: "mg/L", icon: "🧪" },
  { key: "temperature", label: "Temperature", unit: "°C", icon: "🌡️" },
  { key: "tds", label: "TDS", unit: "ppm", icon: "💦" },
  { key: "flowRate", label: "Flow Rate", unit: "L/min", icon: "🚰" },
];

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function average(values) {
  if (!values.length) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function linearRegression(values) {
  if (values.length < 2) return values[0] || 0;
  const n = values.length;
  const xMean = (n - 1) / 2;
  const yMean = average(values);
  let numerator = 0;
  let denominator = 0;

  values.forEach((y, x) => {
    numerator += (x - xMean) * (y - yMean);
    denominator += (x - xMean) ** 2;
  });

  const slope = denominator === 0 ? 0 : numerator / denominator;
  const intercept = yMean - slope * xMean;
  return intercept + slope * n;
}

function zScore(value, values) {
  if (values.length < 4) return 0;
  const mean = average(values);
  const variance = average(values.map((v) => (v - mean) ** 2));
  const std = Math.sqrt(variance);
  return std === 0 ? 0 : Math.abs((value - mean) / std);
}

function formatTime(value) {
  return new Date(value).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatShortTime(value) {
  return new Date(value).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function App() {
  const [sensor, setSensor] = useState(null);
  const [sensorHistory, setSensorHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [backendError, setBackendError] = useState("");
  const [lastRefresh, setLastRefresh] = useState(new Date());

  const [isLoggedIn, setIsLoggedIn] = useState(
    () => localStorage.getItem("aquaguardLoggedIn") === "true"
  );
  const [userRole, setUserRole] = useState(
    () => localStorage.getItem("aquaguardRole") || ""
  );
  const [loggedUser, setLoggedUser] = useState(
    () => localStorage.getItem("aquaguardUser") || ""
  );
  const [selectedRole, setSelectedRole] = useState("admin");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");

  const [plantId, setPlantId] = useState(
    () => localStorage.getItem("aquaguardPlant") || "plant-a"
  );

  const [alertHistory, setAlertHistory] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("aquaguardAlertHistory") || "[]");
    } catch {
      return [];
    }
  });

  const [activityLog, setActivityLog] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("aquaguardActivityLog") || "[]");
    } catch {
      return [];
    }
  });

  const [notificationEnabled, setNotificationEnabled] = useState(
    () => localStorage.getItem("aquaguardNotifications") === "true"
  );

  const [historyMetric, setHistoryMetric] = useState("all");
  const [historyWindow, setHistoryWindow] = useState(20);

  const [chemicalDose, setChemicalDose] = useState(50);
  const [flowRate, setFlowRate] = useState(120);
  const [chlorineDose, setChlorineDose] = useState(50);

  const [scenarioB, setScenarioB] = useState({
    chemicalDose: 70,
    flowRate: 120,
    chlorineDose: 60,
  });

  const [reportMessage, setReportMessage] = useState("");
  const [exportMessage, setExportMessage] = useState("");

  const [showUserPanel, setShowUserPanel] = useState(false);
  const [managedUsers, setManagedUsers] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("aquaguardManagedUsers") || "null");
      return saved || DEMO_USERS.map(({ username, role, name }) => ({ username, role, name }));
    } catch {
      return DEMO_USERS.map(({ username, role, name }) => ({ username, role, name }));
    }
  });
  const [newUser, setNewUser] = useState({
    name: "",
    username: "",
    role: "operator",
    password: "",
  });

  const [activeZone, setActiveZone] = useState("All");
  const [dailyReportDate, setDailyReportDate] = useState(
    () => new Date().toISOString().slice(0, 10)
  );

  const selectedPlant = PLANTS.find((plant) => plant.id === plantId) || PLANTS[0];

  const addActivity = (action) => {
    setActivityLog((previous) => {
      const next = [
        {
          time: new Date().toISOString(),
          user: loggedUser || userRole,
          action,
        },
        ...previous,
      ].slice(0, 20);
      localStorage.setItem("aquaguardActivityLog", JSON.stringify(next));
      return next;
    });
  };

  const handleLogin = (e) => {
    e.preventDefault();
    const enteredUsername = username.trim();

    const allUsers = [
      ...DEMO_USERS,
      ...managedUsers.filter(
        (u) => !DEMO_USERS.some((demo) => demo.username === u.username)
      ),
    ];

    const found = allUsers.find(
      (u) =>
        u.username === enteredUsername &&
        u.password === password &&
        u.role === selectedRole
    );

    if (found) {
      localStorage.setItem("aquaguardLoggedIn", "true");
      localStorage.setItem("aquaguardRole", found.role);
      localStorage.setItem("aquaguardUser", found.username);

      setUserRole(found.role);
      setLoggedUser(found.username);
      setIsLoggedIn(true);
      setLoginError("");
      setPassword("");
      setActivityLog([
        {
          time: new Date().toISOString(),
          user: found.username,
          action: `${found.role === "admin" ? "Admin" : "Operator"} logged in`,
        },
        ...activityLog,
      ].slice(0, 20));
    } else {
      setLoginError(
        selectedRole === "admin"
          ? "Invalid Admin username or password."
          : "Invalid Operator username or password."
      );
    }
  };

  const handleLogout = () => {
    addActivity(`${userRole === "admin" ? "Admin" : "Operator"} logged out`);
    localStorage.removeItem("aquaguardLoggedIn");
    localStorage.removeItem("aquaguardRole");
    localStorage.removeItem("aquaguardUser");
    setIsLoggedIn(false);
    setUserRole("");
    setLoggedUser("");
    setUsername("");
    setPassword("");
    setLoginError("");
    setShowUserPanel(false);
  };

  const fetchSensorData = async () => {
    try {
      const response = await fetch(API_URL);
      if (!response.ok) throw new Error("Backend request failed");

      const data = await response.json();
      const latest = data[0];

      if (latest) {
        setSensor(latest);
        setSensorHistory(data.slice(0, historyWindow).reverse());
        setBackendError("");
        setLastRefresh(new Date());
      }
      setLoading(false);
    } catch (error) {
      setBackendError(
        "Backend not reachable. Keep node server.js and sensorSimulator.js running."
      );
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isLoggedIn) return;
    fetchSensorData();
    const interval = setInterval(fetchSensorData, 3000);
    return () => clearInterval(interval);
  }, [isLoggedIn, historyWindow]);

  useEffect(() => {
    localStorage.setItem("aquaguardPlant", plantId);
  }, [plantId]);

  useEffect(() => {
    localStorage.setItem(
      "aquaguardAlertHistory",
      JSON.stringify(alertHistory.slice(0, 50))
    );
  }, [alertHistory]);

  useEffect(() => {
    localStorage.setItem(
      "aquaguardManagedUsers",
      JSON.stringify(managedUsers)
    );
  }, [managedUsers]);

  const chartData = useMemo(
    () =>
      sensorHistory.map((item, index) => ({
        ...item,
        index: index + 1,
        time: formatShortTime(item.timestamp || Date.now()),
      })),
    [sensorHistory]
  );

  const getAlerts = (currentSensor = sensor) => {
    if (!currentSensor) return [];

    const alerts = [];

    if (currentSensor.ph < THRESHOLDS.ph.min || currentSensor.ph > THRESHOLDS.ph.max) {
      alerts.push({
        key: "ph",
        severity: currentSensor.ph < 6 || currentSensor.ph > 9 ? "critical" : "high",
        icon: "⚠️",
        title: "Abnormal pH Level",
        message: `Current pH is ${currentSensor.ph}. Review the treatment process.`,
      });
    }

    if (currentSensor.turbidity > THRESHOLDS.turbidity.max) {
      alerts.push({
        key: "turbidity",
        severity: currentSensor.turbidity > 8 ? "critical" : "high",
        icon: "🌊",
        title: "High Turbidity",
        message: `Turbidity has reached ${currentSensor.turbidity} NTU. Review filtration and coagulation.`,
      });
    }

    if (currentSensor.chlorine < THRESHOLDS.chlorine.min) {
      alerts.push({
        key: "chlorine",
        severity: currentSensor.chlorine < 0.25 ? "high" : "medium",
        icon: "🧪",
        title: "Low Chlorine",
        message: `Chlorine is ${currentSensor.chlorine} mg/L. Review disinfection conditions.`,
      });
    }

    if (currentSensor.tds > THRESHOLDS.tds.max) {
      alerts.push({
        key: "tds",
        severity: currentSensor.tds > 700 ? "high" : "medium",
        icon: "💧",
        title: "High TDS",
        message: `TDS is ${currentSensor.tds} ppm. Further water-quality checking is recommended.`,
      });
    }

    if (currentSensor.temperature > THRESHOLDS.temperature.max) {
      alerts.push({
        key: "temperature",
        severity: currentSensor.temperature > 40 ? "high" : "medium",
        icon: "🌡️",
        title: "High Temperature",
        message: `Temperature is ${currentSensor.temperature}°C. Check plant conditions.`,
      });
    }

    if (
      currentSensor.flowRate < THRESHOLDS.flowRate.min ||
      currentSensor.flowRate > THRESHOLDS.flowRate.max
    ) {
      alerts.push({
        key: "flowRate",
        severity:
          currentSensor.flowRate < 65 || currentSensor.flowRate > 170
            ? "high"
            : "medium",
        icon: "🚰",
        title: "Abnormal Flow Rate",
        message: `Flow rate is ${currentSensor.flowRate} L/min. Check the pumping system.`,
      });
    }

    return alerts;
  };

  const alerts = useMemo(() => getAlerts(sensor), [sensor]);

  useEffect(() => {
    if (!sensor || !alerts.length) return;

    const currentTime = Date.now();
    const newEntries = alerts.map((alert) => ({
      id: `${currentTime}-${alert.key}-${Math.random()}`,
      timestamp: new Date().toISOString(),
      title: alert.title,
      message: alert.message,
      severity: alert.severity,
    }));

    setAlertHistory((previous) => {
      const latestByKey = {};
      previous.forEach((item) => {
        latestByKey[item.title] = new Date(item.timestamp).getTime();
      });

      const filtered = newEntries.filter(
        (entry) =>
          !latestByKey[entry.title] ||
          currentTime - latestByKey[entry.title] > 12000
      );

      return [...filtered, ...previous].slice(0, 50);
    });
  }, [sensor, alerts]);

  const requestNotifications = async () => {
    if (!("Notification" in window)) {
      setExportMessage("Browser notifications are not supported here.");
      return;
    }

    const permission = await Notification.requestPermission();

    if (permission === "granted") {
      setNotificationEnabled(true);
      localStorage.setItem("aquaguardNotifications", "true");
      new Notification("AquaGuard Notifications Enabled", {
        body: "Critical and high-severity monitoring alerts can now be displayed.",
      });
      addActivity("Enabled browser smart notifications");
    } else {
      setNotificationEnabled(false);
      localStorage.setItem("aquaguardNotifications", "false");
    }
  };

  useEffect(() => {
    if (!notificationEnabled || !alerts.length || !("Notification" in window)) return;
    if (Notification.permission !== "granted") return;

    const critical = alerts.filter(
      (alert) => alert.severity === "critical" || alert.severity === "high"
    );

    if (critical.length) {
      const lastNotice = Number(localStorage.getItem("aquaguardLastNotice") || 0);
      if (Date.now() - lastNotice > 15000) {
        new Notification(`AquaGuard: ${critical.length} alert(s)`, {
          body: critical.map((a) => a.title).join(" • "),
        });
        localStorage.setItem("aquaguardLastNotice", String(Date.now()));
      }
    }
  }, [alerts, notificationEnabled]);

  const anomalyAnalysis = useMemo(() => {
    if (!sensor || sensorHistory.length < 4) {
      return {
        score: 0,
        level: "Learning",
        explanation: "Collecting historical readings for statistical anomaly analysis.",
        signals: [],
      };
    }

    const fields = ["ph", "turbidity", "chlorine", "temperature", "tds", "flowRate"];
    const signals = fields
      .map((field) => {
        const values = sensorHistory.map((item) => Number(item[field])).filter(Number.isFinite);
        return {
          field,
          score: zScore(Number(sensor[field]), values),
          value: sensor[field],
        };
      })
      .sort((a, b) => b.score - a.score);

    const maxScore = signals[0]?.score || 0;
    const score = Math.round(clamp(maxScore * 22, 0, 100));
    const level = score >= 70 ? "High" : score >= 40 ? "Moderate" : "Low";

    const strongest = signals[0];
    const label = PARAMS.find((p) => p.key === strongest?.field)?.label || "sensor";

    return {
      score,
      level,
      explanation:
        score >= 70
          ? `${label} is statistically unusual compared with recent readings.`
          : score >= 40
          ? `${label} shows a moderate deviation from the recent baseline.`
          : "Current readings are close to their recent statistical baseline.",
      signals,
    };
  }, [sensor, sensorHistory]);

  const predictions = useMemo(() => {
    if (sensorHistory.length < 3) return null;

    const fields = ["ph", "turbidity", "chlorine", "temperature", "tds", "flowRate"];
    const output = {};

    fields.forEach((field) => {
      const values = sensorHistory.map((item) => Number(item[field])).filter(Number.isFinite);
      let predicted = linearRegression(values);

      if (field === "ph") predicted = clamp(predicted, 5, 10);
      if (field === "turbidity") predicted = clamp(predicted, 0, 20);
      if (field === "chlorine") predicted = clamp(predicted, 0, 5);
      if (field === "temperature") predicted = clamp(predicted, 10, 50);
      if (field === "tds") predicted = clamp(predicted, 50, 1000);
      if (field === "flowRate") predicted = clamp(predicted, 20, 250);

      output[field] = Number(predicted.toFixed(field === "tds" || field === "flowRate" ? 0 : 2));
    });

    return output;
  }, [sensorHistory]);

  const recommendation = useMemo(() => {
    if (!sensor) {
      return {
        text: "Waiting for sensor data...",
        confidence: 0,
        reason: "The decision-support engine needs a current reading.",
      };
    }

    let text =
      "All configured water-quality indicators are within the prototype monitoring ranges. Continue routine monitoring.";
    let confidence = 82;
    let reason = "The current readings do not show a strong threshold violation.";

    if (sensor.turbidity > 5) {
      const dose = Math.min(
        80,
        Math.max(55, Math.round(50 + (sensor.turbidity - 5) * 5))
      );
      text = `High turbidity detected (${sensor.turbidity} NTU). Review coagulation and filtration. Suggested simulated chemical dose: ${dose}%.`;
      confidence = Math.round(clamp(78 + (sensor.turbidity - 5) * 3, 78, 95));
      reason = `Turbidity is above the configured ${THRESHOLDS.turbidity.max} NTU monitoring threshold.`;
    } else if (sensor.chlorine < 0.5) {
      text = `Low chlorine detected (${sensor.chlorine} mg/L). Review disinfection conditions. Suggested simulated dosing adjustment: +10–20%.`;
      confidence = 86;
      reason = "Chlorine is below the configured monitoring threshold.";
    } else if (sensor.ph < 6.5 || sensor.ph > 8.5) {
      text = `pH is outside the configured monitoring range (${sensor.ph}). Review treatment conditions and chemical balance.`;
      confidence = 84;
      reason = "pH has moved outside the configured monitoring range.";
    } else if (sensor.tds > 500) {
      text = `High TDS detected (${sensor.tds} ppm). Additional water-quality analysis is recommended before treatment changes.`;
      confidence = 79;
      reason = "TDS is above the configured prototype threshold.";
    } else if (sensor.temperature > 35) {
      text = `High temperature detected (${sensor.temperature}°C). Check plant operating conditions and equipment status.`;
      confidence = 77;
      reason = "Temperature is above the configured monitoring threshold.";
    } else if (sensor.flowRate < 80 || sensor.flowRate > 150) {
      text = `Abnormal flow rate detected (${sensor.flowRate} L/min). Check the pumping system before changing treatment settings.`;
      confidence = 80;
      reason = "Flow is outside the configured operating range.";
    }

    return { text, confidence, reason };
  }, [sensor]);

  const equipment = useMemo(() => {
    const currentFlow = sensor?.flowRate || 120;
    const pumpTemperature = Number((42.5 + Math.abs(currentFlow - 120) * 0.12).toFixed(1));
    const vibration = Number((2.4 + Math.abs(currentFlow - 120) * 0.025).toFixed(1));
    const power = Number((4.8 + Math.abs(currentFlow - 120) * 0.018).toFixed(1));

    let risk = 18;
    if (pumpTemperature > 45) risk += 15;
    if (pumpTemperature > 50) risk += 20;
    if (vibration > 3) risk += 20;
    if (vibration > 4) risk += 15;
    if (power > 6) risk += 12;

    risk = Math.min(100, risk);

    const status = risk >= 70 ? "Critical" : risk >= 40 ? "Warning" : "Normal";

    return {
      pumpTemperature,
      vibration,
      power,
      risk,
      status,
    };
  }, [sensor]);

  const digitalTwin = useMemo(() => {
    const currentTurbidity = sensor?.turbidity || 3.5;
    const predicted = Math.max(
      0.5,
      currentTurbidity -
        chemicalDose * 0.025 -
        chlorineDose * 0.005 +
        Math.abs(flowRate - 120) * 0.015
    );

    const estimatedCost = Number(
      (chemicalDose * 0.12 + chlorineDose * 0.06 + Math.abs(flowRate - 120) * 0.01).toFixed(2)
    );

    const status =
      predicted <= 2 ? "Optimal" : predicted <= 4 ? "Acceptable" : "Needs Attention";

    return {
      predicted: Number(predicted.toFixed(2)),
      estimatedCost,
      status,
    };
  }, [sensor, chemicalDose, chlorineDose, flowRate]);

  const scenarioBResult = useMemo(() => {
    const currentTurbidity = sensor?.turbidity || 3.5;
    const predicted = Math.max(
      0.5,
      currentTurbidity -
        scenarioB.chemicalDose * 0.025 -
        scenarioB.chlorineDose * 0.005 +
        Math.abs(scenarioB.flowRate - 120) * 0.015
    );
    const cost = Number(
      (
        scenarioB.chemicalDose * 0.12 +
        scenarioB.chlorineDose * 0.06 +
        Math.abs(scenarioB.flowRate - 120) * 0.01
      ).toFixed(2)
    );
    return {
      predicted: Number(predicted.toFixed(2)),
      cost,
      status: predicted <= 2 ? "Optimal" : predicted <= 4 ? "Acceptable" : "Needs Attention",
    };
  }, [sensor, scenarioB]);

  const complianceItems = useMemo(() => {
    if (!sensor) return [];
    return [
      {
        name: "pH",
        value: sensor.ph,
        unit: "",
        ok: sensor.ph >= 6.5 && sensor.ph <= 8.5,
      },
      {
        name: "Turbidity",
        value: sensor.turbidity,
        unit: " NTU",
        ok: sensor.turbidity <= 5,
      },
      {
        name: "Chlorine",
        value: sensor.chlorine,
        unit: " mg/L",
        ok: sensor.chlorine >= 0.5,
      },
      {
        name: "Temperature",
        value: sensor.temperature,
        unit: " °C",
        ok: sensor.temperature <= 35,
      },
      {
        name: "TDS",
        value: sensor.tds,
        unit: " ppm",
        ok: sensor.tds <= 500,
      },
      {
        name: "Flow Rate",
        value: sensor.flowRate,
        unit: " L/min",
        ok: sensor.flowRate >= 80 && sensor.flowRate <= 150,
      },
    ];
  }, [sensor]);

  const complianceIssues = complianceItems.filter((item) => !item.ok);

  const plantStatus = useMemo(() => {
    if (!sensor) return "Waiting";
    if (alerts.some((a) => a.severity === "critical")) return "Critical";
    if (alerts.length) return "Attention";
    if (equipment.status === "Warning") return "Attention";
    return "Normal";
  }, [sensor, alerts, equipment]);

  const zoneData = useMemo(() => {
    if (!sensor) return [];
    return [
      {
        name: "Raw Water Intake",
        zone: "Intake",
        status: sensor.turbidity > 8 ? "Critical" : sensor.turbidity > 5 ? "Warning" : "Normal",
        metric: `${sensor.turbidity} NTU`,
        description: "Incoming-water quality screening",
      },
      {
        name: "Coagulation",
        zone: "Treatment",
        status: sensor.turbidity > 5 ? "Warning" : "Normal",
        metric: `${chemicalDose}% dose`,
        description: "Coagulant decision-support stage",
      },
      {
        name: "Filtration",
        zone: "Treatment",
        status: sensor.turbidity > 5 ? "Warning" : "Normal",
        metric: `${sensor.turbidity} NTU`,
        description: "Particle-removal monitoring",
      },
      {
        name: "Disinfection",
        zone: "Disinfection",
        status: sensor.chlorine < 0.5 ? "Warning" : "Normal",
        metric: `${sensor.chlorine} mg/L`,
        description: "Residual chlorine monitoring",
      },
      {
        name: "Storage",
        zone: "Storage",
        status: sensor.tds > 500 ? "Warning" : "Normal",
        metric: `${sensor.tds} ppm`,
        description: "Stored-water quality overview",
      },
    ];
  }, [sensor, chemicalDose]);

  const filteredZones =
    activeZone === "All"
      ? zoneData
      : zoneData.filter((zone) => zone.zone === activeZone);

  const dailyStats = useMemo(() => {
    if (!sensorHistory.length) return null;

    const result = {};
    PARAMS.forEach((param) => {
      const values = sensorHistory
        .map((item) => Number(item[param.key]))
        .filter(Number.isFinite);

      result[param.key] = {
        avg: average(values),
        min: Math.min(...values),
        max: Math.max(...values),
      };
    });

    return result;
  }, [sensorHistory]);

  const exportCSV = () => {
    if (!sensorHistory.length) return;

    const headers = ["Time", "pH", "Turbidity", "Chlorine", "Temperature", "TDS", "Flow Rate"];
    const rows = sensorHistory.map((item) => [
      new Date(item.timestamp || Date.now()).toISOString(),
      item.ph,
      item.turbidity,
      item.chlorine,
      item.temperature,
      item.tds,
      item.flowRate,
    ]);

    const csv = [headers, ...rows]
      .map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(","))
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `AquaGuard_Sensor_Data_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);

    setExportMessage("CSV exported successfully.");
    addActivity("Exported sensor data as CSV");
    setTimeout(() => setExportMessage(""), 3000);
  };

  const generateReport = (daily = false) => {
    if (!sensor) {
      setReportMessage("Waiting for sensor data before generating the report.");
      return;
    }

    const doc = new jsPDF();
    const margin = 16;
    const pageWidth = 210;
    let y = 18;

    const addTitle = (text) => {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(15);
      doc.text(text, margin, y);
      y += 9;
    };

    const addLine = (text, size = 10) => {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(size);
      const lines = doc.splitTextToSize(text, pageWidth - margin * 2);
      doc.text(lines, margin, y);
      y += lines.length * 5 + 2;
      if (y > 270) {
        doc.addPage();
        y = 18;
      }
    };

    doc.setFont("helvetica", "bold");
    doc.setFontSize(20);
    doc.text("AquaGuard", margin, y);
    y += 8;

    doc.setFontSize(12);
    doc.setFont("helvetica", "normal");
    doc.text(
      daily
        ? "Daily Water Quality & Operations Report"
        : "Water Quality Monitoring Report",
      margin,
      y
    );
    y += 10;

    addLine(`Plant: ${selectedPlant.name} (${selectedPlant.capacity})`);
    addLine(`Generated: ${new Date().toLocaleString()}`);
    addLine(`Prepared by: ${loggedUser || userRole}`);

    addTitle("1. Current Sensor Readings");
    PARAMS.forEach((param) => {
      addLine(`${param.label}: ${sensor[param.key]}${param.unit ? ` ${param.unit}` : ""}`);
    });

    addTitle("2. Smart Alert Summary");
    addLine(
      alerts.length
        ? alerts.map((alert) => `${alert.title} — ${alert.severity.toUpperCase()}`).join("\n")
        : "No active alerts."
    );

    addTitle("3. Predictive Analysis");
    addLine(`Anomaly score: ${anomalyAnalysis.score}% (${anomalyAnalysis.level})`);
    addLine(anomalyAnalysis.explanation);

    if (predictions) {
      addLine(
        `Next-reading prediction — pH ${predictions.ph}, Turbidity ${predictions.turbidity} NTU, Chlorine ${predictions.chlorine} mg/L, TDS ${predictions.tds} ppm, Flow ${predictions.flowRate} L/min.`
      );
    }

    addTitle("4. AI Decision Support");
    addLine(`Confidence: ${recommendation.confidence}%`);
    addLine(recommendation.text);
    addLine(`Reason: ${recommendation.reason}`);

    addTitle("5. Equipment Health");
    addLine(
      `Pump temperature ${equipment.pumpTemperature}°C, vibration ${equipment.vibration} mm/s, power ${equipment.power} kW.`
    );
    addLine(`Failure-risk score: ${equipment.risk}% — ${equipment.status}.`);

    addTitle("6. Digital Twin");
    addLine(
      `Scenario A: dose ${chemicalDose}%, chlorine ${chlorineDose}%, flow ${flowRate} L/min. Predicted turbidity ${digitalTwin.predicted} NTU. Estimated model cost ${digitalTwin.estimatedCost} units.`
    );
    addLine(
      `Scenario B: dose ${scenarioB.chemicalDose}%, chlorine ${scenarioB.chlorineDose}%, flow ${scenarioB.flowRate} L/min. Predicted turbidity ${scenarioBResult.predicted} NTU. Estimated model cost ${scenarioBResult.cost} units.`
    );

    addTitle("7. Compliance Overview");
    addLine(
      complianceIssues.length
        ? `${complianceIssues.length} configured parameter(s) require review.`
        : "All configured prototype monitoring parameters are within range."
    );

    addTitle("8. Prototype Disclaimer");
    addLine(
      "AquaGuard is a college-project decision-support prototype. Thresholds, predictive estimates, equipment risk scores and simulated dosing values are demonstration models and are not regulatory limits or real-world chemical dosing instructions. Qualified operator/engineer review is required before treatment or maintenance action."
    );

    doc.setFontSize(9);
    doc.text("AquaGuard © 2026 | Smart Water Treatment Monitoring", margin, 288);

    const fileName = `AquaGuard_${daily ? "Daily_" : ""}Report_${new Date()
      .toISOString()
      .slice(0, 10)}.pdf`;

    doc.save(fileName);

    setReportMessage(
      daily
        ? "Daily operations report generated successfully."
        : "Professional PDF report generated successfully."
    );

    addActivity(daily ? "Generated daily water-quality report" : "Generated professional PDF report");
    setTimeout(() => setReportMessage(""), 4000);
  };

  const addManagedUser = (e) => {
    e.preventDefault();

    if (userRole !== "admin") return;

    if (!newUser.name || !newUser.username || !newUser.password) {
      setExportMessage("Fill all new-user fields.");
      return;
    }

    if (
      managedUsers.some((u) => u.username === newUser.username) ||
      DEMO_USERS.some((u) => u.username === newUser.username)
    ) {
      setExportMessage("Username already exists.");
      return;
    }

    const created = {
      name: newUser.name,
      username: newUser.username,
      role: newUser.role,
      password: newUser.password,
    };

    setManagedUsers((previous) => [...previous, created]);
    setNewUser({ name: "", username: "", role: "operator", password: "" });
    setExportMessage("User added successfully.");
    addActivity(`Admin added ${created.role} user ${created.username}`);
  };

  const removeManagedUser = (targetUsername) => {
    if (userRole !== "admin") return;
    setManagedUsers((previous) =>
      previous.filter((user) => user.username !== targetUsername)
    );
    addActivity(`Admin removed user ${targetUsername}`);
  };

  const resetScenario = () => {
    setChemicalDose(50);
    setFlowRate(120);
    setChlorineDose(50);
    setScenarioB({ chemicalDose: 70, flowRate: 120, chlorineDose: 60 });
    addActivity("Reset Digital Twin scenarios");
  };

  if (!isLoggedIn) {
    return (
      <div style={styles.loginPage}>
        <div style={styles.loginCard}>
          <div style={styles.loginIcon}>💧</div>
          <h1 style={styles.loginTitle}>AquaGuard</h1>
          <p style={styles.loginSubtitle}>
            AI-Powered Smart Water Treatment Monitoring
          </p>

          <div style={styles.loginBadge}>🔐 Secure Role-Based Login</div>

          <div style={styles.roleSelector}>
            <button
              type="button"
              onClick={() => setSelectedRole("admin")}
              style={{
                ...styles.roleButton,
                ...(selectedRole === "admin" ? styles.roleButtonActive : {}),
              }}
            >
              👑 Admin
            </button>
            <button
              type="button"
              onClick={() => setSelectedRole("operator")}
              style={{
                ...styles.roleButton,
                ...(selectedRole === "operator" ? styles.roleButtonActive : {}),
              }}
            >
              🧑‍🔧 Operator
            </button>
          </div>

          <form onSubmit={handleLogin}>
            <input
              style={styles.loginInput}
              placeholder={`${selectedRole === "admin" ? "Admin" : "Operator"} username`}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
            <input
              style={styles.loginInput}
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />

            {loginError && <div style={styles.loginError}>⚠️ {loginError}</div>}

            <button style={styles.loginButton}>Login to AquaGuard</button>
          </form>

          <div style={styles.demoCredentials}>
            <strong>Demo accounts</strong>
            <span>Admin: admin</span>
            <span>Operator: operator</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.app}>
      <header style={styles.header}>
        <div>
          <h1 style={styles.logo}>AquaGuard</h1>
          <p style={styles.headerSubtitle}>
            AI-Powered Smart Water Treatment Monitoring System
          </p>
        </div>

        <div style={styles.headerRight}>
          <div style={styles.onlineBadge}>
            <span style={styles.greenDot}></span>
            {backendError ? "Backend Check" : "System Online"}
          </div>

          <select
            value={plantId}
            onChange={(e) => {
              setPlantId(e.target.value);
              addActivity(`Switched monitoring plant to ${e.target.value}`);
            }}
            style={styles.plantSelect}
          >
            {PLANTS.map((plant) => (
              <option key={plant.id} value={plant.id}>
                {plant.name}
              </option>
            ))}
          </select>

          <span style={styles.roleBadge}>
            {userRole === "admin" ? "👑 Admin" : "🧑‍🔧 Operator"}
          </span>

          <button onClick={handleLogout} style={styles.logoutButton}>
            Logout
          </button>
        </div>
      </header>

      {backendError && (
        <div style={styles.backendBanner}>
          ⚠️ {backendError}
        </div>
      )}

      <main style={styles.container}>
        <div style={styles.pageTitleRow}>
          <div>
            <h2 style={styles.pageTitle}>Water Quality Monitoring</h2>
            <p style={styles.pageSubtitle}>
              {selectedPlant.name} • {selectedPlant.location} • {selectedPlant.capacity}
            </p>
          </div>
          <div style={styles.livePill}>● LIVE • 3 SEC REFRESH</div>
        </div>

        <section style={styles.kpiGrid}>
          <KPI icon="📡" title="Sensors" value="6" subtitle="Live monitoring" />
          <KPI icon="🚨" title="Active Alerts" value={alerts.length} subtitle="Current conditions" />
          <KPI
            icon="🔴"
            title="Plant Status"
            value={plantStatus}
            subtitle="Decision-support status"
          />
          <KPI
            icon="🔄"
            title="Last Refresh"
            value={formatShortTime(lastRefresh)}
            subtitle="Auto refresh: 3 sec"
          />
        </section>

        <section style={styles.sensorGrid}>
          {PARAMS.map((param) => (
            <div key={param.key} style={styles.sensorCard}>
              <div style={styles.sensorIcon}>{param.icon}</div>
              <div>
                <div style={styles.sensorLabel}>{param.label}</div>
                <div style={styles.sensorValue}>
                  {sensor ? sensor[param.key] : "--"}
                  {param.unit && <small>{param.unit}</small>}
                </div>
              </div>
            </div>
          ))}
        </section>

        <section style={styles.section}>
          <SectionHeader
            icon="🚨"
            title="Smart Alerts & Notifications"
            right={
              <button
                onClick={requestNotifications}
                style={notificationEnabled ? styles.smallGreenButton : styles.smallButton}
              >
                {notificationEnabled ? "🔔 Notifications ON" : "🔕 Enable Notifications"}
              </button>
            }
          />

          {alerts.length === 0 ? (
            <div style={styles.emptyState}>✅ No active threshold alerts.</div>
          ) : (
            <div style={styles.alertGrid}>
              {alerts.map((alert) => (
                <div
                  key={alert.key}
                  style={{
                    ...styles.alertCard,
                    borderLeftColor:
                      alert.severity === "critical"
                        ? "#ff3d4f"
                        : alert.severity === "high"
                        ? "#ff7043"
                        : "#ffc107",
                  }}
                >
                  <div style={styles.alertIcon}>{alert.icon}</div>
                  <div>
                    <strong>{alert.title}</strong>
                    <p>{alert.message}</p>
                    <span style={styles.severityTag}>
                      {alert.severity.toUpperCase()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section style={styles.section}>
          <SectionHeader
            icon="🕘"
            title="Alert History"
            right={<span style={styles.infoPill}>{alertHistory.length} recent events</span>}
          />

          <div style={styles.historyList}>
            {alertHistory.length === 0 ? (
              <div style={styles.emptyState}>No alert events recorded yet.</div>
            ) : (
              alertHistory.slice(0, 12).map((item) => (
                <div key={item.id} style={styles.historyItem}>
                  <span style={styles.historyDot}></span>
                  <div style={{ flex: 1 }}>
                    <strong>{item.title}</strong>
                    <div style={styles.historyMessage}>{item.message}</div>
                  </div>
                  <div style={styles.historyTime}>
                    {formatTime(item.timestamp)}
                    <br />
                    <small>{item.severity}</small>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        <section style={styles.section}>
          <SectionHeader
            icon="📈"
            title="Real-Time Data Analytics"
            right={
              <div style={styles.controlRow}>
                <select
                  value={historyMetric}
                  onChange={(e) => setHistoryMetric(e.target.value)}
                  style={styles.select}
                >
                  <option value="all">All Trends</option>
                  {PARAMS.map((p) => (
                    <option key={p.key} value={p.key}>
                      {p.label}
                    </option>
                  ))}
                </select>
                <select
                  value={historyWindow}
                  onChange={(e) => setHistoryWindow(Number(e.target.value))}
                  style={styles.select}
                >
                  <option value={10}>10 readings</option>
                  <option value={20}>20 readings</option>
                  <option value={40}>40 readings</option>
                  <option value={60}>60 readings</option>
                </select>
                <button onClick={exportCSV} style={styles.smallButton}>
                  📥 Export CSV
                </button>
              </div>
            }
          />

          <p style={styles.sectionText}>
            Interactive historical trends from MongoDB sensor readings.
          </p>

          <div style={styles.chartBox}>
            <ResponsiveContainer width="100%" height={320}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2b3438" />
                <XAxis dataKey="time" stroke="#9fb0b7" />
                <YAxis stroke="#9fb0b7" />
                <Tooltip />
                <Legend />
                {(historyMetric === "all" || historyMetric === "ph") && (
                  <Line type="monotone" dataKey="ph" name="pH" stroke="#4fc3f7" dot={false} />
                )}
                {(historyMetric === "all" || historyMetric === "turbidity") && (
                  <Line type="monotone" dataKey="turbidity" name="Turbidity" stroke="#ff8a65" dot={false} />
                )}
                {(historyMetric === "all" || historyMetric === "chlorine") && (
                  <Line type="monotone" dataKey="chlorine" name="Chlorine" stroke="#81c784" dot={false} />
                )}
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div style={styles.chartBox}>
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2b3438" />
                <XAxis dataKey="time" stroke="#9fb0b7" />
                <YAxis stroke="#9fb0b7" />
                <Tooltip />
                <Legend />
                {(historyMetric === "all" || historyMetric === "temperature") && (
                  <Area type="monotone" dataKey="temperature" name="Temperature" fill="#7e57c2" stroke="#7e57c2" />
                )}
                {(historyMetric === "all" || historyMetric === "tds") && (
                  <Area type="monotone" dataKey="tds" name="TDS" fill="#29b6f6" stroke="#29b6f6" />
                )}
                {(historyMetric === "all" || historyMetric === "flowRate") && (
                  <Area type="monotone" dataKey="flowRate" name="Flow Rate" fill="#66bb6a" stroke="#66bb6a" />
                )}
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {exportMessage && <div style={styles.successMessage}>✅ {exportMessage}</div>}
        </section>

        <section style={styles.section}>
          <SectionHeader icon="🤖" title="AI Monitoring & Recommendation" />

          <p style={styles.sectionText}>
            AquaGuard combines threshold reasoning, recent-history statistics and a lightweight
            predictive model to provide operator decision support.
          </p>

          <div style={styles.aiGrid}>
            <div style={styles.aiRecommendation}>
              <h3>💡 Recommendation</h3>
              <p>{recommendation.text}</p>
              <div style={styles.confidenceBarWrap}>
                <div style={{ ...styles.confidenceBar, width: `${recommendation.confidence}%` }} />
              </div>
              <strong>{recommendation.confidence}% confidence</strong>
              <small>Confidence is a prototype model score, not a validated clinical/regulatory probability.</small>
            </div>

            <div style={styles.explanationBox}>
              <h3>🧠 Why this recommendation?</h3>
              <p>{recommendation.reason}</p>
              <p>
                Recent statistical anomaly score: <strong>{anomalyAnalysis.score}%</strong>{" "}
                ({anomalyAnalysis.level}).
              </p>
              <p>{anomalyAnalysis.explanation}</p>
            </div>
          </div>

          <div style={styles.predictionPanel}>
            <h3>🔮 Next-Reading Prediction</h3>
            {predictions ? (
              <div style={styles.predictionGrid}>
                {PARAMS.map((param) => (
                  <div key={param.key} style={styles.predictionCard}>
                    <span>{param.icon} {param.label}</span>
                    <strong>
                      {predictions[param.key]}
                      {param.unit ? ` ${param.unit}` : ""}
                    </strong>
                  </div>
                ))}
              </div>
            ) : (
              <p>Collecting more readings for prediction...</p>
            )}
            <small>
              Prediction uses a lightweight linear-regression model on recent simulator readings.
              It is a project prototype and requires validation before operational use.
            </small>
          </div>
        </section>

        <section style={styles.section}>
          <SectionHeader icon="🗺️" title="Treatment Plant Zone Monitoring" />

          <div style={styles.zoneControls}>
            {["All", "Intake", "Treatment", "Disinfection", "Storage"].map((zone) => (
              <button
                key={zone}
                onClick={() => {
                  setActiveZone(zone);
                  addActivity(`Viewed ${zone} plant zone`);
                }}
                style={{
                  ...styles.zoneButton,
                  ...(activeZone === zone ? styles.zoneButtonActive : {}),
                }}
              >
                {zone}
              </button>
            ))}
          </div>

          <div style={styles.processFlow}>
            <div>🚰 Intake</div><span>→</span>
            <div>⚗️ Coagulation</div><span>→</span>
            <div>🧹 Filtration</div><span>→</span>
            <div>🧪 Disinfection</div><span>→</span>
            <div>💧 Storage</div>
          </div>

          <div style={styles.zoneGrid}>
            {filteredZones.map((zone) => (
              <div key={zone.name} style={styles.zoneCard}>
                <div style={styles.zoneTop}>
                  <strong>{zone.name}</strong>
                  <span
                    style={{
                      ...styles.statusPill,
                      ...(zone.status === "Critical"
                        ? styles.statusCritical
                        : zone.status === "Warning"
                        ? styles.statusWarning
                        : styles.statusNormal),
                    }}
                  >
                    {zone.status}
                  </span>
                </div>
                <div style={styles.zoneMetric}>{zone.metric}</div>
                <p>{zone.description}</p>
              </div>
            ))}
          </div>
        </section>

        <section style={styles.section}>
          <SectionHeader icon="🔧" title="Equipment Monitoring & Predictive Maintenance" />

          <p style={styles.sectionText}>
            Simulated equipment telemetry is evaluated to estimate stress and maintenance risk.
          </p>

          <div style={styles.equipmentGrid}>
            <MetricCard icon="🌡️" label="Pump Temperature" value={`${equipment.pumpTemperature} °C`} />
            <MetricCard icon="📳" label="Vibration Level" value={`${equipment.vibration} mm/s`} />
            <MetricCard icon="⚡" label="Power Consumption" value={`${equipment.power} kW`} />
            <MetricCard
              icon="🟢"
              label="Equipment Status"
              value={equipment.status}
              accent={equipment.status === "Normal" ? "#42f59b" : "#ffb74d"}
            />
          </div>

          <div style={styles.riskPanel}>
            <h3>⚠️ Failure Risk Assessment</h3>
            <div style={styles.riskTrack}>
              <div
                style={{
                  ...styles.riskFill,
                  width: `${equipment.risk}%`,
                }}
              />
            </div>
            <strong>
              {equipment.risk >= 70
                ? "High Risk"
                : equipment.risk >= 40
                ? "Medium Risk"
                : "Low Risk"}{" "}
              — {equipment.risk}%
            </strong>
            <p>
              {equipment.status === "Normal"
                ? "Equipment parameters are within the normal simulated operating range. Continue routine monitoring."
                : "Abnormal simulated equipment conditions detected. Schedule inspection and review the pumping system."}
            </p>
          </div>

          <div style={styles.logicBox}>
            <h3>🔍 Fault Detection Logic</h3>
            <p>
              The prototype evaluates pump temperature, vibration, power consumption and flow
              deviation. It combines these signals into a maintenance-risk score.
            </p>
          </div>
        </section>

        <section style={styles.section}>
          <SectionHeader icon="🧬" title="Digital Twin Treatment Simulation" />

          <p style={styles.sectionText}>
            Experiment with simulated treatment conditions and compare two scenarios before taking
            any real-world action.
          </p>

          <div style={styles.twinGrid}>
            <div style={styles.twinCard}>
              <h3>Scenario A — Current Simulation</h3>
              <label>Chemical Dose: {chemicalDose}%</label>
              <input
                type="range"
                min="0"
                max="100"
                value={chemicalDose}
                onChange={(e) => setChemicalDose(Number(e.target.value))}
              />
              <label>Chlorine Dose: {chlorineDose}%</label>
              <input
                type="range"
                min="0"
                max="100"
                value={chlorineDose}
                onChange={(e) => setChlorineDose(Number(e.target.value))}
              />
              <label>Flow Rate: {flowRate} L/min</label>
              <input
                type="range"
                min="50"
                max="200"
                value={flowRate}
                onChange={(e) => setFlowRate(Number(e.target.value))}
              />

              <div style={styles.twinResult}>
                <span>Predicted Turbidity</span>
                <strong>{digitalTwin.predicted} NTU</strong>
                <b>{digitalTwin.status}</b>
                <small>Estimated model cost: {digitalTwin.estimatedCost} units</small>
              </div>
            </div>

            <div style={styles.twinCard}>
              <h3>Scenario B — Compare</h3>
              <label>Chemical Dose: {scenarioB.chemicalDose}%</label>
              <input
                type="range"
                min="0"
                max="100"
                value={scenarioB.chemicalDose}
                onChange={(e) =>
                  setScenarioB((s) => ({ ...s, chemicalDose: Number(e.target.value) }))
                }
              />
              <label>Chlorine Dose: {scenarioB.chlorineDose}%</label>
              <input
                type="range"
                min="0"
                max="100"
                value={scenarioB.chlorineDose}
                onChange={(e) =>
                  setScenarioB((s) => ({ ...s, chlorineDose: Number(e.target.value) }))
                }
              />
              <label>Flow Rate: {scenarioB.flowRate} L/min</label>
              <input
                type="range"
                min="50"
                max="200"
                value={scenarioB.flowRate}
                onChange={(e) =>
                  setScenarioB((s) => ({ ...s, flowRate: Number(e.target.value) }))
                }
              />

              <div style={styles.twinResult}>
                <span>Predicted Turbidity</span>
                <strong>{scenarioBResult.predicted} NTU</strong>
                <b>{scenarioBResult.status}</b>
                <small>Estimated model cost: {scenarioBResult.cost} units</small>
              </div>
            </div>
          </div>

          <div style={styles.comparePanel}>
            <h3>📊 Scenario Comparison</h3>
            <div style={styles.compareGrid}>
              <div>
                <span>Scenario A</span>
                <strong>{digitalTwin.predicted} NTU</strong>
                <small>{digitalTwin.status}</small>
              </div>
              <div>
                <span>Scenario B</span>
                <strong>{scenarioBResult.predicted} NTU</strong>
                <small>{scenarioBResult.status}</small>
              </div>
              <div>
                <span>Predicted Difference</span>
                <strong>
                  {(scenarioBResult.predicted - digitalTwin.predicted).toFixed(2)} NTU
                </strong>
                <small>simulation only</small>
              </div>
            </div>
          </div>

          <button onClick={resetScenario} style={styles.resetButton}>
            ↺ Reset Scenarios
          </button>

          <div style={styles.disclaimer}>
            ⚠️ <strong>Prototype decision support:</strong> Digital Twin values are simulated
            estimates for demonstration and are not real-world chemical dosing instructions.
            Qualified operator/engineer review is required.
          </div>
        </section>

        <section style={styles.section}>
          <SectionHeader icon="📋" title="Water Quality Compliance" />

          <div
            style={{
              ...styles.complianceOverall,
              ...(complianceIssues.length === 0
                ? styles.complianceGood
                : styles.complianceWarning),
            }}
          >
            {complianceIssues.length === 0
              ? "🟢 All Configured Checks Within Range"
              : `🟡 ${complianceIssues.length} Parameter(s) Require Review`}
          </div>

          <div style={styles.complianceGrid}>
            {complianceItems.map((item) => (
              <div key={item.name} style={styles.complianceCard}>
                <div>{item.name}</div>
                <strong>
                  {item.value}
                  {item.unit}
                </strong>
                <span
                  style={item.ok ? styles.complianceGoodSmall : styles.complianceWarningSmall}
                >
                  {item.ok ? "✅ Within Range" : "⚠️ Review Required"}
                </span>
              </div>
            ))}
          </div>

          <div style={styles.disclaimer}>
            This is a prototype compliance view using AquaGuard's configured demonstration
            thresholds, not a substitute for applicable regulatory standards or laboratory testing.
          </div>
        </section>

        <section style={styles.section}>
          <SectionHeader icon="🔮" title="Predictive Maintenance Analytics" />

          <div style={styles.chartBox}>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart
                data={[
                  { name: "Pump Temp", value: equipment.pumpTemperature },
                  { name: "Vibration", value: equipment.vibration * 10 },
                  { name: "Power", value: equipment.power * 10 },
                  { name: "Risk", value: equipment.risk },
                  { name: "Anomaly", value: anomalyAnalysis.score },
                ]}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#2b3438" />
                <XAxis dataKey="name" stroke="#9fb0b7" />
                <YAxis stroke="#9fb0b7" />
                <Tooltip />
                <Bar dataKey="value" name="Risk / Scaled Metric" fill="#42a5f5" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section style={styles.section}>
          <SectionHeader icon="📊" title="Monitoring Information" />

          <div style={styles.infoGrid}>
            <InfoCard label="Last Updated" value={sensor ? formatTime(sensor.timestamp) : "--"} />
            <InfoCard label="Monitoring Mode" value="Real-Time" />
            <InfoCard label="Data Source" value="Sensor Simulator" />
            <InfoCard label="Database" value="MongoDB" />
            <InfoCard label="API Ingestion" value="/api/sensors" />
            <InfoCard label="Refresh Cycle" value="Every 3 seconds" />
            <InfoCard label="ML Engine" value="In-browser statistical model" />
            <InfoCard label="Plant Capacity" value={selectedPlant.capacity} />
          </div>
        </section>

        <section style={styles.section}>
          <SectionHeader icon="📡" title="IoT Device & Data Pipeline" />

          <div style={styles.deviceGrid}>
            <DeviceCard
              name="Sensor Simulator"
              status="Online"
              detail="Node.js → REST POST → MongoDB"
            />
            <DeviceCard
              name="ESP32 / IoT Gateway"
              status="Ready"
              detail="Future hardware can POST JSON to the same API"
            />
            <DeviceCard
              name="AquaGuard Backend"
              status={backendError ? "Offline" : "Online"}
              detail="Node.js + Express"
            />
            <DeviceCard
              name="Database"
              status={backendError ? "Check" : "Connected"}
              detail="MongoDB Atlas"
            />
          </div>

          <div style={styles.pipeline}>
            <span>Sensor / ESP32</span>
            <b>→</b>
            <span>Node + Express</span>
            <b>→</b>
            <span>MongoDB</span>
            <b>→</b>
            <span>Analytics + AI</span>
            <b>→</b>
            <span>React Dashboard</span>
          </div>

          <div style={styles.apiNote}>
            <strong>IoT integration point:</strong> future ESP32/Arduino firmware can send the
            same fields — ph, turbidity, chlorine, temperature, tds and flowRate — to
            <code> POST /api/sensors</code>.
          </div>
        </section>

        <section style={styles.section}>
          <SectionHeader icon="📅" title="Daily Performance Report" />

          <div style={styles.dailyHeader}>
            <div>
              <p style={styles.sectionText}>
                Generate a daily operational summary from the latest stored readings, alerts,
                predictive analysis, equipment health and compliance status.
              </p>
              <input
                type="date"
                value={dailyReportDate}
                onChange={(e) => setDailyReportDate(e.target.value)}
                style={styles.select}
              />
            </div>
            <button onClick={() => generateReport(true)} style={styles.primaryButton}>
              📄 Generate Daily Report
            </button>
          </div>

          {dailyStats && (
            <div style={styles.statsTable}>
              <div style={styles.statsRowHeader}>
                <span>Parameter</span><span>Average</span><span>Minimum</span><span>Maximum</span>
              </div>
              {PARAMS.map((param) => (
                <div style={styles.statsRow} key={param.key}>
                  <span>{param.label}</span>
                  <span>{dailyStats[param.key].avg.toFixed(2)}</span>
                  <span>{dailyStats[param.key].min}</span>
                  <span>{dailyStats[param.key].max}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        {userRole === "admin" && (
          <section style={styles.section}>
            <SectionHeader
              icon="👥"
              title="Advanced User Management"
              right={
                <button
                  onClick={() => setShowUserPanel((value) => !value)}
                  style={styles.smallButton}
                >
                  {showUserPanel ? "Hide Panel" : "Manage Users"}
                </button>
              }
            />

            {showUserPanel && (
              <>
                <form onSubmit={addManagedUser} style={styles.userForm}>
                  <input
                    style={styles.smallInput}
                    placeholder="Full name"
                    value={newUser.name}
                    onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}
                  />
                  <input
                    style={styles.smallInput}
                    placeholder="Username"
                    value={newUser.username}
                    onChange={(e) => setNewUser({ ...newUser, username: e.target.value })}
                  />
                  <input
                    style={styles.smallInput}
                    type="password"
                    placeholder="Password"
                    value={newUser.password}
                    onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                  />
                  <select
                    style={styles.select}
                    value={newUser.role}
                    onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}
                  >
                    <option value="operator">Operator</option>
                    <option value="admin">Admin</option>
                  </select>
                  <button style={styles.primaryButton}>Add User</button>
                </form>

                <div style={styles.userList}>
                  {managedUsers.map((user) => (
                    <div key={user.username} style={styles.userRow}>
                      <div>
                        <strong>{user.name}</strong>
                        <span>{user.username} • {user.role}</span>
                      </div>
                      {!DEMO_USERS.some((demo) => demo.username === user.username) && (
                        <button
                          onClick={() => removeManagedUser(user.username)}
                          style={styles.removeButton}
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}
          </section>
        )}

        <section style={styles.section}>
          <SectionHeader icon="📝" title="User Activity Log" />

          <p style={styles.sectionText}>
            Recent actions performed during this AquaGuard dashboard session.
          </p>

          <div style={styles.activityList}>
            {activityLog.length === 0 ? (
              <div style={styles.emptyState}>No activity recorded yet.</div>
            ) : (
              activityLog.slice(0, 10).map((item, index) => (
                <div key={`${item.time}-${index}`} style={styles.activityItem}>
                  <span>•</span>
                  <strong>{item.action}</strong>
                  <small>{item.user} • {formatTime(item.time)}</small>
                </div>
              ))
            )}
          </div>
        </section>

        <section style={styles.reportSection}>
          <div>
            <h2 style={styles.reportTitle}>📄 Professional Water Quality Report</h2>
            <p style={styles.reportText}>
              Generate a formatted PDF containing sensor readings, alerts, AI analysis,
              equipment risk, Digital Twin comparison and compliance status.
            </p>
          </div>

          <button onClick={() => generateReport(false)} style={styles.primaryButton}>
            📥 Generate PDF Report
          </button>

          {reportMessage && <div style={styles.successMessage}>✅ {reportMessage}</div>}
        </section>

        <footer style={styles.footer}>
          AquaGuard © 2026 | AI-Powered Smart Water Treatment Monitoring
        </footer>
      </main>
    </div>
  );
}

function KPI({ icon, title, value, subtitle }) {
  return (
    <div style={styles.kpiCard}>
      <div style={styles.kpiIcon}>{icon}</div>
      <div>
        <div style={styles.kpiTitle}>{title}</div>
        <strong style={styles.kpiValue}>{value}</strong>
        <div style={styles.kpiSubtitle}>{subtitle}</div>
      </div>
    </div>
  );
}

function SectionHeader({ icon, title, right }) {
  return (
    <div style={styles.sectionHeader}>
      <h2 style={styles.sectionTitle}>
        <span>{icon}</span> {title}
      </h2>
      {right}
    </div>
  );
}

function MetricCard({ icon, label, value, accent }) {
  return (
    <div style={styles.metricCard}>
      <span>{icon}</span>
      <small>{label}</small>
      <strong style={{ color: accent || "#f4f7f8" }}>{value}</strong>
    </div>
  );
}

function InfoCard({ label, value }) {
  return (
    <div style={styles.infoCard}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function DeviceCard({ name, status, detail }) {
  return (
    <div style={styles.deviceCard}>
      <div style={styles.deviceTop}>
        <strong>{name}</strong>
        <span style={status === "Offline" ? styles.deviceOffline : styles.deviceOnline}>
          ● {status}
        </span>
      </div>
      <p>{detail}</p>
    </div>
  );
}

const styles = {
  app: {
    minHeight: "100vh",
    background: "#0d1113",
    color: "#f4f7f8",
    fontFamily: "Arial, sans-serif",
  },
  header: {
    background: "#0d6b7e",
    minHeight: 96,
    padding: "0 6%",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 20,
    flexWrap: "wrap",
  },
  logo: {
    margin: 0,
    fontSize: 48,
    letterSpacing: -2,
  },
  headerSubtitle: {
    margin: "0 0 4px",
    fontSize: 19,
  },
  headerRight: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap",
  },
  onlineBadge: {
    background: "#10171a",
    padding: "16px 24px",
    borderRadius: 30,
    fontWeight: 700,
    color: "#45e8ff",
  },
  greenDot: {
    display: "inline-block",
    width: 12,
    height: 12,
    borderRadius: "50%",
    background: "#00e676",
    marginRight: 8,
  },
  roleBadge: {
    background: "#0b2029",
    padding: "14px 18px",
    borderRadius: 25,
    color: "#53d9ff",
    fontWeight: 700,
  },
  plantSelect: {
    background: "#10181b",
    color: "#e8f1f4",
    border: "1px solid #2b6d7a",
    borderRadius: 10,
    padding: "11px 12px",
    maxWidth: 210,
  },
  logoutButton: {
    background: "transparent",
    color: "#ff8080",
    border: "1px solid #ff6b6b",
    borderRadius: 25,
    padding: "12px 22px",
    cursor: "pointer",
    fontWeight: 700,
  },
  backendBanner: {
    background: "#4a1e1e",
    color: "#ffb0b0",
    padding: "12px 6%",
    textAlign: "center",
    fontWeight: 700,
  },
  container: {
    width: "92%",
    maxWidth: 1350,
    margin: "0 auto",
    padding: "48px 0 30px",
  },
  pageTitleRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 20,
    marginBottom: 28,
    flexWrap: "wrap",
  },
  pageTitle: {
    textAlign: "left",
    fontSize: 46,
    margin: 0,
  },
  pageSubtitle: {
    color: "#9eb1b9",
    fontSize: 17,
    marginTop: 8,
  },
  livePill: {
    background: "#0b2d35",
    border: "1px solid #20bdd8",
    color: "#61e8ff",
    padding: "10px 16px",
    borderRadius: 20,
    fontWeight: 700,
  },
  kpiGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(4, 1fr)",
    gap: 20,
    marginBottom: 28,
  },
  kpiCard: {
    background: "#151b1e",
    border: "1px solid #263137",
    borderRadius: 18,
    padding: 24,
    display: "flex",
    alignItems: "center",
    gap: 20,
    minHeight: 115,
  },
  kpiIcon: {
    fontSize: 38,
  },
  kpiTitle: {
    color: "#9fb0b7",
    marginBottom: 7,
  },
  kpiValue: {
    fontSize: 25,
  },
  kpiSubtitle: {
    color: "#778990",
    marginTop: 8,
    fontSize: 13,
  },
  sensorGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(3, 1fr)",
    gap: 22,
    marginBottom: 30,
  },
  sensorCard: {
    background: "#151a1d",
    borderRadius: 20,
    padding: 34,
    minHeight: 120,
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    gap: 28,
    boxShadow: "0 8px 30px rgba(0,0,0,.16)",
  },
  sensorIcon: {
    fontSize: 54,
  },
  sensorLabel: {
    color: "#a8b7be",
    fontSize: 18,
  },
  sensorValue: {
    fontSize: 42,
    fontWeight: 800,
    marginTop: 4,
  },
  sensorValueSmall: {},
  section: {
    background: "#14191c",
    borderRadius: 22,
    padding: 34,
    marginBottom: 28,
    border: "1px solid #1c2529",
  },
  sectionHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 20,
    flexWrap: "wrap",
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 31,
    margin: 0,
  },
  sectionText: {
    color: "#d0dadd",
    fontSize: 17,
    lineHeight: 1.6,
  },
  smallButton: {
    background: "#0b303a",
    border: "1px solid #2cc5e4",
    color: "#62e7ff",
    borderRadius: 10,
    padding: "10px 15px",
    cursor: "pointer",
    fontWeight: 700,
  },
  smallGreenButton: {
    background: "#0d3424",
    border: "1px solid #35df8b",
    color: "#53f3a3",
    borderRadius: 10,
    padding: "10px 15px",
    cursor: "pointer",
    fontWeight: 700,
  },
  infoPill: {
    background: "#0b3440",
    color: "#5ee8ff",
    padding: "9px 14px",
    borderRadius: 20,
    fontWeight: 700,
  },
  alertGrid: {
    display: "grid",
    gridTemplateColumns: "1fr",
    gap: 13,
  },
  alertCard: {
    background: "#251718",
    borderLeft: "6px solid #ff3d4f",
    borderRadius: 14,
    padding: 20,
    display: "flex",
    gap: 18,
  },
  alertIcon: {
    fontSize: 30,
  },
  alertCardP: {
    color: "#d0dadd",
  },
  severityTag: {
    display: "inline-block",
    marginTop: 6,
    fontSize: 11,
    background: "#3a2526",
    color: "#ffadad",
    padding: "5px 8px",
    borderRadius: 10,
    fontWeight: 700,
  },
  emptyState: {
    padding: 30,
    textAlign: "center",
    background: "#0f1517",
    borderRadius: 14,
    color: "#80a0aa",
  },
  historyList: {
    display: "grid",
    gap: 10,
  },
  historyItem: {
    display: "flex",
    alignItems: "center",
    gap: 15,
    padding: 16,
    border: "1px solid #263137",
    borderRadius: 13,
    background: "#0f1517",
  },
  historyDot: {
    width: 14,
    height: 14,
    borderRadius: "50%",
    background: "#ff4058",
  },
  historyMessage: {
    color: "#aebbc0",
    marginTop: 5,
  },
  historyTime: {
    textAlign: "right",
    color: "#91a4ab",
    fontSize: 12,
  },
  controlRow: {
    display: "flex",
    gap: 9,
    flexWrap: "wrap",
  },
  select: {
    background: "#0e1517",
    color: "#e8f1f4",
    border: "1px solid #324047",
    borderRadius: 9,
    padding: "10px 12px",
  },
  chartBox: {
    width: "100%",
    background: "#0d1315",
    borderRadius: 15,
    padding: "20px 8px",
    marginTop: 20,
  },
  successMessage: {
    marginTop: 15,
    background: "#0d3322",
    color: "#5ef0a2",
    padding: 12,
    borderRadius: 10,
  },
  aiGrid: {
    display: "grid",
    gridTemplateColumns: "1.2fr 1fr",
    gap: 18,
    marginTop: 22,
  },
  aiRecommendation: {
    background: "#10313a",
    borderLeft: "5px solid #36cbe7",
    borderRadius: 14,
    padding: 24,
  },
  explanationBox: {
    background: "#101617",
    borderLeft: "5px solid #8c70ff",
    borderRadius: 14,
    padding: 24,
  },
  confidenceBarWrap: {
    height: 10,
    background: "#2b3336",
    borderRadius: 10,
    overflow: "hidden",
    margin: "18px 0 7px",
  },
  confidenceBar: {
    height: "100%",
    background: "#4ceca0",
  },
  predictionPanel: {
    marginTop: 20,
    background: "#0d1d22",
    borderRadius: 15,
    padding: 24,
  },
  predictionGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(6, 1fr)",
    gap: 10,
    margin: "18px 0",
  },
  predictionCard: {
    background: "#12191c",
    border: "1px solid #263137",
    padding: 14,
    borderRadius: 12,
    textAlign: "center",
  },
  predictionCardStrong: {},
  zoneControls: {
    display: "flex",
    gap: 9,
    flexWrap: "wrap",
    margin: "15px 0",
  },
  zoneButton: {
    background: "#101719",
    color: "#9eb0b7",
    border: "1px solid #314047",
    borderRadius: 20,
    padding: "9px 15px",
    cursor: "pointer",
  },
  zoneButtonActive: {
    background: "#0d3a45",
    color: "#58e6ff",
    borderColor: "#31c7e3",
  },
  processFlow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    flexWrap: "wrap",
    background: "#0d1517",
    padding: 18,
    borderRadius: 15,
    color: "#b7c4c9",
  },
  zoneGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(5, 1fr)",
    gap: 12,
    marginTop: 18,
  },
  zoneCard: {
    background: "#101719",
    border: "1px solid #263238",
    borderRadius: 14,
    padding: 18,
  },
  zoneTop: {
    display: "flex",
    justifyContent: "space-between",
    gap: 8,
    alignItems: "center",
  },
  zoneMetric: {
    fontSize: 26,
    fontWeight: 800,
    marginTop: 20,
  },
  statusPill: {
    padding: "5px 8px",
    borderRadius: 12,
    fontSize: 11,
    fontWeight: 700,
  },
  statusNormal: {
    background: "#0c3b26",
    color: "#50f1a0",
  },
  statusWarning: {
    background: "#4a3611",
    color: "#ffd36d",
  },
  statusCritical: {
    background: "#4a1c20",
    color: "#ff818d",
  },
  equipmentGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(4, 1fr)",
    gap: 14,
  },
  metricCard: {
    background: "#0d1416",
    borderRadius: 15,
    padding: 22,
    textAlign: "center",
  },
  metricCardSmall: {},
  metricCardStrong: {},
  riskPanel: {
    marginTop: 18,
    background: "#132b30",
    padding: 24,
    borderRadius: 15,
    textAlign: "center",
  },
  riskTrack: {
    height: 16,
    background: "#33383a",
    borderRadius: 20,
    overflow: "hidden",
    margin: "20px 0",
  },
  riskFill: {
    height: "100%",
    background: "#42ef9d",
  },
  logicBox: {
    marginTop: 16,
    background: "#0d1719",
    borderLeft: "4px solid #38c7e3",
    padding: 18,
    borderRadius: 12,
  },
  twinGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 20,
  },
  twinCard: {
    background: "#0e1517",
    borderRadius: 17,
    padding: 25,
    border: "1px solid #263237",
  },
  twinCardLabel: {},
  twinCardInput: {},
  twinResult: {
    marginTop: 18,
    background: "#103640",
    borderRadius: 13,
    padding: 18,
    display: "grid",
    gap: 8,
  },
  comparePanel: {
    marginTop: 18,
    background: "#0d2025",
    borderRadius: 15,
    padding: 22,
  },
  compareGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(3, 1fr)",
    gap: 12,
  },
  compareGridDiv: {
    background: "#101719",
    borderRadius: 12,
    padding: 15,
  },
  resetButton: {
    marginTop: 16,
    background: "transparent",
    color: "#61e8ff",
    border: "1px solid #2ebbd4",
    borderRadius: 10,
    padding: "10px 16px",
    cursor: "pointer",
  },
  disclaimer: {
    marginTop: 18,
    background: "#332a13",
    border: "1px solid #725c21",
    color: "#ffd983",
    borderRadius: 13,
    padding: 17,
    lineHeight: 1.5,
  },
  complianceOverall: {
    display: "inline-block",
    borderRadius: 24,
    padding: "12px 18px",
    margin: "10px 0 20px",
    fontWeight: 800,
  },
  complianceGood: {
    background: "#0d3523",
    color: "#55ef9f",
  },
  complianceWarning: {
    background: "#403214",
    color: "#ffd46d",
  },
  complianceGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(3, 1fr)",
    gap: 15,
  },
  complianceCard: {
    background: "#0e1517",
    border: "1px solid #2b3539",
    borderRadius: 14,
    padding: 22,
    textAlign: "center",
    display: "grid",
    gap: 10,
  },
  complianceGoodSmall: {
    background: "#0c3423",
    color: "#51ed9d",
    borderRadius: 18,
    padding: "7px 10px",
    fontWeight: 700,
  },
  complianceWarningSmall: {
    background: "#453512",
    color: "#ffd36c",
    borderRadius: 18,
    padding: "7px 10px",
    fontWeight: 700,
  },
  infoGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(4, 1fr)",
    gap: 14,
  },
  infoCard: {
    background: "#0e1517",
    borderRadius: 14,
    padding: 20,
    textAlign: "center",
  },
  infoCardSpan: {},
  deviceGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(4, 1fr)",
    gap: 14,
  },
  deviceCard: {
    background: "#0e1517",
    border: "1px solid #263238",
    borderRadius: 14,
    padding: 18,
  },
  deviceTop: {
    display: "flex",
    justifyContent: "space-between",
    gap: 8,
  },
  deviceOnline: {
    color: "#53eea0",
    fontSize: 12,
  },
  deviceOffline: {
    color: "#ff6f75",
    fontSize: 12,
  },
  pipeline: {
    marginTop: 18,
    background: "#0a3038",
    padding: 20,
    borderRadius: 15,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 14,
    flexWrap: "wrap",
    color: "#64e8ff",
    fontWeight: 700,
  },
  apiNote: {
    marginTop: 14,
    background: "#101719",
    padding: 17,
    borderRadius: 12,
    color: "#aebdc2",
  },
  dailyHeader: {
    display: "flex",
    justifyContent: "space-between",
    gap: 20,
    alignItems: "center",
    flexWrap: "wrap",
  },
  primaryButton: {
    background: "#35bfdf",
    color: "#061116",
    border: 0,
    borderRadius: 12,
    padding: "14px 20px",
    cursor: "pointer",
    fontWeight: 800,
    fontSize: 15,
  },
  statsTable: {
    marginTop: 20,
    border: "1px solid #29353a",
    borderRadius: 13,
    overflow: "hidden",
  },
  statsRowHeader: {
    display: "grid",
    gridTemplateColumns: "2fr 1fr 1fr 1fr",
    background: "#0b2b32",
    padding: 13,
    fontWeight: 700,
  },
  statsRow: {
    display: "grid",
    gridTemplateColumns: "2fr 1fr 1fr 1fr",
    padding: 13,
    borderTop: "1px solid #202a2e",
  },
  userForm: {
    display: "grid",
    gridTemplateColumns: "1.2fr 1fr 1fr .8fr auto",
    gap: 10,
    background: "#0d1517",
    padding: 18,
    borderRadius: 14,
  },
  smallInput: {
    background: "#11191b",
    border: "1px solid #324047",
    color: "#f4f7f8",
    borderRadius: 9,
    padding: "10px 12px",
  },
  userList: {
    marginTop: 15,
    display: "grid",
    gap: 8,
  },
  userRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    background: "#0e1517",
    padding: 14,
    borderRadius: 11,
  },
  userRowSpan: {
    display: "block",
  },
  removeButton: {
    background: "#3a1c20",
    color: "#ff858b",
    border: "1px solid #8b3b43",
    borderRadius: 8,
    padding: "8px 12px",
    cursor: "pointer",
  },
  activityList: {
    display: "grid",
    gap: 8,
  },
  activityItem: {
    display: "grid",
    gridTemplateColumns: "20px 1fr auto",
    gap: 8,
    alignItems: "center",
    background: "#0e1517",
    padding: 14,
    borderRadius: 11,
  },
  reportSection: {
    background: "#0e313b",
    border: "1px solid #1ba7c4",
    borderRadius: 22,
    padding: 35,
    display: "flex",
    justifyContent: "space-between",
    gap: 20,
    alignItems: "center",
    flexWrap: "wrap",
  },
  reportTitle: {
    fontSize: 30,
    margin: 0,
  },
  reportText: {
    color: "#c7d5da",
    maxWidth: 750,
    lineHeight: 1.6,
  },
  footer: {
    textAlign: "center",
    color: "#71838a",
    padding: "35px 0 10px",
  },
  loginPage: {
    minHeight: "100vh",
    background: "radial-gradient(circle at top, #123f4a, #0b1113 60%)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  loginCard: {
    width: "100%",
    maxWidth: 480,
    background: "#131a1d",
    border: "1px solid #2d444b",
    borderRadius: 24,
    padding: 38,
    boxShadow: "0 20px 70px rgba(0,0,0,.45)",
    textAlign: "center",
  },
  loginIcon: {
    fontSize: 60,
  },
  loginTitle: {
    fontSize: 45,
    margin: "5px 0",
  },
  loginSubtitle: {
    color: "#a8b9bf",
    lineHeight: 1.5,
  },
  loginBadge: {
    background: "#0c2f38",
    color: "#58e6ff",
    borderRadius: 18,
    padding: 9,
    margin: "20px 0",
    fontWeight: 700,
  },
  roleSelector: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 9,
    marginBottom: 15,
  },
  roleButton: {
    background: "#101719",
    color: "#98aab0",
    border: "1px solid #324148",
    padding: 13,
    borderRadius: 11,
    cursor: "pointer",
    fontWeight: 700,
  },
  roleButtonActive: {
    background: "#0e3b47",
    color: "#63e8ff",
    borderColor: "#2ac5e3",
  },
  loginInput: {
    width: "100%",
    boxSizing: "border-box",
    background: "#0d1416",
    color: "#f5f7f8",
    border: "1px solid #34434a",
    borderRadius: 10,
    padding: 14,
    marginBottom: 12,
    outline: "none",
  },
  loginButton: {
    width: "100%",
    background: "#35bfdf",
    color: "#061116",
    border: 0,
    borderRadius: 11,
    padding: 15,
    cursor: "pointer",
    fontWeight: 800,
    fontSize: 16,
  },
  loginError: {
    background: "#401e22",
    color: "#ff929a",
    padding: 10,
    borderRadius: 9,
    marginBottom: 12,
  },
  demoCredentials: {
    marginTop: 22,
    display: "grid",
    gap: 5,
    color: "#81939a",
    fontSize: 13,
  },
};

export default App;
