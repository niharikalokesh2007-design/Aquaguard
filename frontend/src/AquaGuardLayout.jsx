import React, { useState } from "react";
import "./AquaGuardLayout.css";

/**
 * Reusable placeholder card for modules or sections in progress.
 */
export function AquaGuardPlaceholder({ icon = "⚡", title, description, note }) {
  return (
    <div className="ag-placeholder">
      <div className="ag-placeholder-icon">{icon}</div>
      <h2>{title}</h2>
      {description && <p>{description}</p>}
      {note && <div className="ag-placeholder-note">{note}</div>}
    </div>
  );
}

/**
 * Main application shell layout for AquaGuard.
 * Provides sidebar navigation, responsive mobile drawer, topbar, and page content wrapper.
 */
export default function AquaGuardLayout({
  activeModule = "treatment",
  activeSection = "overview",
  onSelectModule,
  onNavigateSection,
  plants = [],
  selectedPlantId,
  onSelectPlant,
  userRole = "admin",
  loggedUser = "Admin",
  onLogout,
  backendError = "",
  lastRefresh,
  alertsCount = 0,
  pageEyebrow,
  pageTitle,
  pageSubtitle,
  children,
}) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleNavClick = (module, sectionId) => {
    setMobileMenuOpen(false);

    if (onSelectModule && module !== activeModule) {
      onSelectModule(module);
    }

    if (onNavigateSection) {
      onNavigateSection(sectionId);
    } else if (sectionId) {
      // Smooth scroll fallback if section ID is present in the DOM
      const targetElement = document.getElementById(sectionId);
      if (targetElement) {
        targetElement.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }
  };

  const userInitials = (loggedUser || userRole || "AG")
    .split(" ")
    .map((name) => name[0])
    .filter(Boolean)
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="ag-app">
      {/* Mobile Drawer Backdrop Overlay */}
      {mobileMenuOpen && (
        <div
          className="ag-mobile-overlay"
          onClick={() => setMobileMenuOpen(false)}
          role="button"
          tabIndex={0}
          aria-label="Close navigation overlay"
        />
      )}

      {/* Main Sidebar Navigation */}
      <aside className={`ag-sidebar ${mobileMenuOpen ? "ag-sidebar-open" : ""}`}>
        <div className="ag-brand">
          <div className="ag-brand-icon">💧</div>
          <div>
            <h2>AquaGuard</h2>
            <p>Smart Water AI</p>
          </div>
        </div>

        <div className="ag-sidebar-scroll">
          {/* Module 1: Treatment Plant */}
          <div className="ag-nav-group">
            <div className="ag-nav-heading">Treatment Plant</div>

            <button
              type="button"
              className={`ag-nav-item ${activeModule === "treatment" && activeSection === "overview" ? "ag-nav-active" : ""}`}
              onClick={() => handleNavClick("treatment", "treatment-module")}
            >
              <span className="ag-nav-icon">📊</span>
              <span className="ag-nav-label">Plant Overview</span>
              {activeModule === "treatment" && activeSection === "overview" && <span className="ag-active-dot" />}
            </button>

            <button
              type="button"
              className={`ag-nav-item ${activeSection === "alerts" ? "ag-nav-active" : ""}`}
              onClick={() => handleNavClick("treatment", "alerts-section")}
            >
              <span className="ag-nav-icon">🚨</span>
              <span className="ag-nav-label">Alerts & Status</span>
              {alertsCount > 0 ? (
                <span className="ag-nav-badge">{alertsCount}</span>
              ) : (
                activeSection === "alerts" && <span className="ag-active-dot" />
              )}
            </button>

            <button
              type="button"
              className={`ag-nav-item ${activeSection === "analytics" ? "ag-nav-active" : ""}`}
              onClick={() => handleNavClick("treatment", "analytics-section")}
            >
              <span className="ag-nav-icon">📈</span>
              <span className="ag-nav-label">Data Analytics</span>
              {activeSection === "analytics" && <span className="ag-active-dot" />}
            </button>

            <button
              type="button"
              className={`ag-nav-item ${activeSection === "digital-twin" ? "ag-nav-active" : ""}`}
              onClick={() => handleNavClick("treatment", "digital-twin-section")}
            >
              <span className="ag-nav-icon">🧬</span>
              <span className="ag-nav-label">Digital Twin Sim</span>
              {activeSection === "digital-twin" && <span className="ag-active-dot" />}
            </button>

            <button
              type="button"
              className={`ag-nav-item ${activeSection === "reports" ? "ag-nav-active" : ""}`}
              onClick={() => handleNavClick("treatment", "reports-section")}
            >
              <span className="ag-nav-icon">📄</span>
              <span className="ag-nav-label">PDF Reports</span>
              {activeSection === "reports" && <span className="ag-active-dot" />}
            </button>
          </div>

          {/* Module 2: Agriculture AI */}
          <div className="ag-nav-group">
            <div className="ag-nav-heading">Agriculture AI</div>

            <button
              type="button"
              className={`ag-nav-item ${activeModule === "agriculture" && activeSection === "crop-advisor" ? "ag-nav-active ag-nav-active-green" : ""}`}
              onClick={() => handleNavClick("agriculture", "crop-advisor")}
            >
              <span className="ag-nav-icon">💧</span>
              <span className="ag-nav-label">Crop Water Advisor</span>
              {activeModule === "agriculture" && activeSection === "crop-advisor" && (
                <span className="ag-active-dot ag-active-dot-green" />
              )}
            </button>

            <button
              type="button"
              className={`ag-nav-item ${activeModule === "agriculture" && activeSection === "irrigation" ? "ag-nav-active ag-nav-active-green" : ""}`}
              onClick={() => handleNavClick("agriculture", "irrigation-management")}
            >
              <span className="ag-nav-icon">🚜</span>
              <span className="ag-nav-label">Smart Irrigation</span>
              {activeModule === "agriculture" && activeSection === "irrigation" && (
                <span className="ag-active-dot ag-active-dot-green" />
              )}
            </button>
          </div>
        </div>

        {/* Sidebar Footer */}
        <div className="ag-sidebar-footer">
          <span className="ag-status-dot" />
          <div>
            <strong>Telemetry Active</strong>
            <p>{lastRefresh ? `Sync: ${lastRefresh}` : "Auto-refresh: 3s"}</p>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="ag-main">
        {/* Topbar Header */}
        <header className="ag-topbar">
          <div className="ag-topbar-left">
            <button
              type="button"
              className="ag-menu-button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label="Toggle navigation drawer"
            >
              ☰
            </button>

            <div>
              <div className="ag-breadcrumb">
                AquaGuard / {activeModule === "agriculture" ? "Agriculture AI" : "Water Treatment"}
              </div>
              <h3>
                {activeModule === "agriculture"
                  ? "Smart Agriculture & Irrigation Hub"
                  : "Water Quality Monitoring"}
              </h3>
            </div>
          </div>

          <div className="ag-topbar-right">
            {plants && plants.length > 0 && (
              <select
                className="ag-plant-select"
                value={selectedPlantId}
                onChange={(e) => onSelectPlant && onSelectPlant(e.target.value)}
                aria-label="Select treatment plant"
              >
                {plants.map((plant) => (
                  <option key={plant.id} value={plant.id}>
                    {plant.name}
                  </option>
                ))}
              </select>
            )}

            <div className="ag-live-status">
              <span />
              {backendError ? "Backend Alert" : "System Online"}
            </div>

            <div className="ag-avatar">{userInitials}</div>

            <div className="ag-user-info">
              <strong>{loggedUser || (userRole === "admin" ? "System Admin" : "Operator")}</strong>
              <span>{userRole === "admin" ? "👑 Admin" : "🧑‍🔧 Operator"}</span>
            </div>

            {onLogout && (
              <button
                type="button"
                className="ag-logout-btn"
                onClick={onLogout}
              >
                Logout
              </button>
            )}
          </div>
        </header>

        {/* Page Container */}
        <main className="ag-page">
          {backendError && (
            <div className="ag-banner-error">
              <span>⚠️</span>
              <span>{backendError}</span>
            </div>
          )}

          {(pageTitle || pageEyebrow) && (
            <div className="ag-page-heading">
              <div>
                {pageEyebrow && <div className="ag-eyebrow">{pageEyebrow}</div>}
                {pageTitle && <h1>{pageTitle}</h1>}
                {pageSubtitle && <p>{pageSubtitle}</p>}
              </div>
              <div className="ag-live-status">
                <span />
                ● LIVE • 3 SEC REFRESH
              </div>
            </div>
          )}

          {children}

          <footer className="ag-footer">
            <span>AquaGuard © 2026 | AI-Powered Smart Water Treatment & Irrigation Monitoring</span>
            <span>All systems operational • Decision-support prototype</span>
          </footer>
        </main>
      </div>
    </div>
  );
}
