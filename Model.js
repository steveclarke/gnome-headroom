function empty(id, name) {
  return {id: id, name: name || id, plan: "", state: "loading", message: "Checking usage…", observedAt: 0, windows: []}
}

function fresh(provider, now) {
  return provider && provider.state === "fresh" && typeof provider.observedAt === "number"
    && provider.observedAt > 0 && now >= provider.observedAt - 5000
    && now - provider.observedAt <= 600000
}

function percentage(window, now) {
  if (!window || typeof window.used !== "number" || !isFinite(window.used)) return "—"
  if (window.resetAt > 0 && now >= window.resetAt) return "—"
  return Math.round(Math.max(0, Math.min(1, 1 - window.used)) * 100) + "%"
}

function find(provider, id) {
  var list = provider ? provider.windows || [] : []
  for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i]
  return null
}

function message(provider, now) {
  if (!provider) return "Waiting for the usage service"
  if (provider.state !== "fresh") return provider.message || "Usage unavailable"
  if (!fresh(provider, now)) return "Outdated · refresh to check usage"
  for (var i = 0; i < provider.windows.length; i++)
    if (provider.windows[i].resetAt > 0 && now >= provider.windows[i].resetAt) return "Window reset · awaiting fresh usage"
  return ""
}

function merge(previous, incoming) {
  // Preserve last-good numbers, but never carry forward their freshness.
  if (incoming.state !== "fresh" && !incoming.windows.length && previous && previous.windows.length) {
    incoming = Object.assign({}, incoming, {windows: previous.windows, observedAt: previous.observedAt, plan: previous.plan})
  }
  return incoming
}

function demo(now, mode) {
  function win(id, title, used, period, elapsed) {
    return {id: id, title: title, used: used, resetAt: now + period - elapsed, durationMs: period}
  }
  var hour = 3600000, week = 168 * hour
  var providers = [
    {id: "claude", name: "Claude Code", plan: "Max", state: "fresh", message: "", observedAt: now,
      windows: [win("session", "Session", 0.4, 5 * hour, hour), win("weekly", "Weekly", 0.24, week, 72 * hour), win("fable-weekly", "Fable Weekly", 0.485, week, 84 * hour)]},
    {id: "codex", name: "Codex", plan: "Pro", state: "fresh", message: "", observedAt: now,
      windows: [win("session", "Session", 0.2, 5 * hour, 2 * hour), win("weekly", "Weekly", 0.35, week, 96 * hour)]}
  ]
  if (mode === "stale") providers.forEach(function(p) { p.state = "stale"; p.message = "Last reading · refresh failed"; p.observedAt -= 900000 })
  if (mode === "empty") providers.forEach(function(p) { p.state = "unavailable"; p.message = "Sign in with the provider CLI, then refresh"; p.windows = []; p.observedAt = 0 })
  return providers
}

// Use the same deadlines as the service timer, including the separate cost worker.
function refreshLabel(service, now) {
  if (!service) return "Updates unavailable"
  if (service.demoMode !== "") return "Sample data"
  if (service.refreshing || service.costsRefreshing) return "Updating…"
  var deadlines = []
  if (service.selectedIds.length) deadlines.push(service.nextRefreshAt)
  if (service.costIds.length) deadlines.push(service.nextCostRefreshAt)
  if (!deadlines.length) return "Updates paused"
  var remaining = Math.min.apply(null, deadlines) - now
  if (remaining <= 0) return "Next update soon"
  if (remaining < 60000) return "Next update in <1 min"
  return "Next update in " + Math.floor(remaining / 60000) + " min"
}
