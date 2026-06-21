import assert from "node:assert/strict";
import { createCampusStore } from "../src/server/campus-store";
import { createPaperclipClient } from "../src/server/paperclip-client";
import { createMockEventSequence, createMockPaperclipSnapshot } from "../src/server/mock-paperclip";

const owner = { role: "company_owner" as const, companyIds: ["company-nova"] };
const observer = { role: "observer" as const, companyIds: ["company-nova"] };

function testOverviewScope() {
  const store = loadedStore();
  const overview = store.getOverview(owner);
  assert.equal(overview.buildings.length, 1);
  assert.equal(overview.buildings[0]?.companyId, "company-nova");
}

function testFloorCapacityAndFilters() {
  const store = loadedStore();
  const floorId = store.getOverview(owner).buildings[0]!.floorId;
  const floor = store.getFloorView(floorId, owner);
  assert.equal(floor.seats.length, 1000);
  assert.ok(floor.seats.some((seat) => seat.employee?.displayName === "Ren"));
  const filtered = store.getFloorView(floorId, owner, { status: "blocked" });
  assert.equal(filtered.seats.length, 1);
  assert.equal(filtered.seats[0]?.task?.identifier, "NVA-43");
}

function testEventIdempotency() {
  const store = loadedStore();
  const [first, second, duplicate] = createMockEventSequence();
  assert.equal(store.applyPaperclipEvent(first!), true);
  assert.equal(store.applyPaperclipEvent(second!), true);
  assert.equal(store.applyPaperclipEvent(duplicate!), false);
  const floorId = store.getOverview(owner).buildings[0]!.floorId;
  const floor = store.getFloorView(floorId, owner, { query: "Ren" });
  assert.equal(floor.seats[0]?.agentStatus, "running");
  assert.equal(floor.seats[0]?.task?.status, "in_review");
}

function testObserverMasking() {
  const store = loadedStore();
  const floorId = store.getOverview(observer).buildings[0]!.floorId;
  const floor = store.getFloorView(floorId, observer, { query: "restricted" });
  assert.equal(floor.seats[0]?.employee?.displayName, "Restricted agent");
  assert.equal(floor.seats[0]?.task?.title, "Restricted high-priority task");
  const timeline = store.getTimeline(observer, "task", "task-issue-nva-43");
  assert.equal(timeline[0]?.payload.secretRef, "[masked]");
}

function testForbiddenCompany() {
  const store = loadedStore();
  const orbitFloorId = store.getOverview({ role: "company_owner" as const, companyIds: ["company-orbit"] }).buildings[0]!.floorId;
  assert.throws(() => store.getFloorView(orbitFloorId, owner), /forbidden/);
}

function testDetailEndpointsData() {
  const store = loadedStore();
  assert.equal(store.getEmployee("employee-agent-ava", owner).displayName, "Ava");
  assert.equal(store.getTask("task-issue-nva-42", owner).identifier, "NVA-42");
  assert.equal(store.getCompanyMetrics("company-nova", owner).pendingApprovals, 1);
}

function testDynamicCompanyLayout() {
  const store = createCampusStore();
  store.loadFromPaperclip({
    ...createMockPaperclipSnapshot(),
    companies: [{ id: "real-company", name: "Real Company", issuePrefix: "REAL", budgetMonthlyCents: 1000, spentMonthlyCents: 100 }],
    agents: [{ id: "real-agent", companyId: "real-company", name: "Real Agent", role: "engineer", title: null, status: "running", reportsTo: null, spentMonthlyCents: 10, budgetMonthlyCents: 100 }],
    issues: [],
    activity: [],
    dashboards: [{ companyId: "real-company", pendingApprovals: 0 }],
  });
  const overview = store.getOverview({ role: "company_owner", companyIds: [] });
  assert.equal(overview.buildings[0]?.companyId, "real-company");
  const floor = store.getFloorView(overview.buildings[0]!.floorId, { role: "company_owner", companyIds: [] });
  assert.equal(floor.seats.filter((seat) => seat.employee?.displayName === "Real Agent").length, 1);
}

async function testPaperclipClientFallback() {
  const snapshot = await createPaperclipClient().snapshot();
  assert.ok(snapshot.companies.length >= 2);
  assert.ok(snapshot.agents.length >= 4);
}

function loadedStore() {
  const store = createCampusStore();
  store.loadFromPaperclip(createMockPaperclipSnapshot());
  return store;
}

const tests = [
  testOverviewScope,
  testFloorCapacityAndFilters,
  testEventIdempotency,
  testObserverMasking,
  testForbiddenCompany,
  testDetailEndpointsData,
  testDynamicCompanyLayout,
];

for (const test of tests) {
  test();
  console.log(`ok ${test.name}`);
}

await testPaperclipClientFallback();
console.log("ok testPaperclipClientFallback");
