import { describe, expect, it } from "vitest";
import { createInitialState } from "../src/simulation/model";
import { executeCommand } from "../src/simulation/commands";
import { calculateTangentAngleDifferenceRad, isTangentContinuous } from "../src/simulation/geometry";
import { inspectTrackRadii } from "../src/simulation/inspection";
import { findStationRoute } from "../src/simulation/operations";

describe("Tangent-valid railway connectivity", () => {
  it("treats 90-degree crossing as not connected and rejects explicit non-tangent straight connection", () => {
    let state = createInitialState();

    // Create horizontal straight track
    const res1 = executeCommand(state, {
      type: "track.create",
      geometry: "straight",
      points: [{ x: 0, y: 0 }, { x: 100, y: 0 }],
    });
    state = res1.state;
    const track1Id = state.tracks[0].id;

    // Explicitly connecting a perpendicular (90-degree) straight track should fail with Japanese error
    expect(() => {
      executeCommand(state, {
        type: "track.create",
        geometry: "straight",
        points: [{ x: 50, y: -50 }, { x: 50, y: 50 }],
        startConnectionTrackId: track1Id,
      });
    }).toThrow(/接線方向が一致しない直線線路は接続できません/);

    // Creating a perpendicular straight track without explicit connection creates no junction
    const res2 = executeCommand(state, {
      type: "track.create",
      geometry: "straight",
      points: [{ x: 50, y: -50 }, { x: 50, y: 50 }],
    });
    state = res2.state;
    expect(state.junctions).toHaveLength(0);
  });

  it("validates collinear reverse-direction connection", () => {
    // Tangent (1, 0) vs (-1, 0)
    const t1 = { x: 1, y: 0 };
    const t2 = { x: -1, y: 0 };
    const diffRad = calculateTangentAngleDifferenceRad(t1, t2);
    expect(diffRad).toBeCloseTo(0, 5);
    expect(isTangentContinuous(t1, t2)).toBe(true);

    let state = createInitialState();
    const res1 = executeCommand(state, {
      type: "track.create",
      geometry: "straight",
      points: [{ x: 0, y: 0 }, { x: 100, y: 0 }],
    });
    state = res1.state;

    // Create a collinear track starting at (100,0) going backwards to (0,0)
    const res2 = executeCommand(state, {
      type: "track.create",
      geometry: "straight",
      points: [{ x: 200, y: 0 }, { x: 100, y: 0 }],
      endConnectionTrackId: state.tracks[0].id,
    });
    state = res2.state;
    expect(state.junctions).toHaveLength(1);
  });

  it("generates smooth branch curve without explicit tangents", () => {
    let state = createInitialState();
    const res1 = executeCommand(state, {
      type: "track.create",
      geometry: "straight",
      points: [{ x: 0, y: 0 }, { x: 100, y: 0 }],
    });
    state = res1.state;
    const track1Id = state.tracks[0].id;

    // Branch curve starting at (100, 0) without specifying startTangent
    const res2 = executeCommand(state, {
      type: "track.create",
      geometry: "curve",
      points: [{ x: 100, y: 0 }, { x: 150, y: 50 }, { x: 200, y: 100 }],
      startConnectionTrackId: track1Id,
    });
    state = res2.state;
    const curveTrack = state.tracks.find((t) => t.geometry === "curve")!;
    expect(curveTrack.startTangent).toBeDefined();
    expect(curveTrack.startTangent!.x).toBeCloseTo(1, 3);
    expect(curveTrack.startTangent!.y).toBeCloseTo(0, 3);
  });

  it("generates two-ended AI curve smooth at both connected ends", () => {
    let state = createInitialState();
    // Track 1: (0,0) -> (100,0)
    const res1 = executeCommand(state, {
      type: "track.create",
      geometry: "straight",
      points: [{ x: 0, y: 0 }, { x: 100, y: 0 }],
    });
    state = res1.state;
    const track1Id = state.tracks[0].id;

    // Track 2: (200,100) -> (300,100)
    const res2 = executeCommand(state, {
      type: "track.create",
      geometry: "straight",
      points: [{ x: 200, y: 100 }, { x: 300, y: 100 }],
    });
    state = res2.state;
    const track2Id = state.tracks[1].id;

    // Connect Track 1 and Track 2 with a curve without explicit tangents
    const res3 = executeCommand(state, {
      type: "track.create",
      geometry: "curve",
      points: [{ x: 100, y: 0 }, { x: 200, y: 100 }],
      startConnectionTrackId: track1Id,
      endConnectionTrackId: track2Id,
    });
    state = res3.state;
    const curveTrack = state.tracks.find((t) => t.id === `track-${res3.state.nextTrackId - 1}`)!;
    expect(curveTrack.startTangent).toBeDefined();
    expect(curveTrack.endTangent).toBeDefined();
    expect(curveTrack.startTangent!.x).toBeCloseTo(1, 3);
    expect(curveTrack.startTangent!.y).toBeCloseTo(0, 3);
    expect(curveTrack.endTangent!.x).toBeCloseTo(1, 3);
    expect(curveTrack.endTangent!.y).toBeCloseTo(0, 3);
  });

  it("reports invalid junction in inspection result and treats as disconnected in topology", () => {
    let state = createInitialState();
    const res1 = executeCommand(state, {
      type: "track.create",
      geometry: "straight",
      points: [{ x: 0, y: 0 }, { x: 100, y: 0 }],
    });
    state = res1.state;

    const res2 = executeCommand(state, {
      type: "track.create",
      geometry: "straight",
      points: [{ x: 50, y: -50 }, { x: 50, y: 50 }],
    });
    state = res2.state;

    // Manually inject a malformed 90-degree junction
    const malformedJunction = {
      id: "junction-malformed-90",
      position: { x: 50, y: 0 },
      ports: [
        { trackId: state.tracks[0].id, location: "interior" as const, distanceM: 50 },
        { trackId: state.tracks[1].id, location: "interior" as const, distanceM: 50 },
      ],
    };
    state.junctions.push(malformedJunction);

    const inspection = inspectTrackRadii(state);
    expect(inspection.topology.invalidConnections).toHaveLength(1);
    expect(inspection.topology.invalidConnections[0].junctionId).toBe("junction-malformed-90");
    expect(inspection.topology.invalidConnections[0].angleDifferenceDeg).toBeCloseTo(90, 1);

    // Connected components should treat them as separate components
    expect(inspection.topology.connectedComponents).toHaveLength(2);
  });

  it("prevents route search from traversing invalid junction", () => {
    let state = createInitialState();
    // Track 1: horizontal
    const res1 = executeCommand(state, {
      type: "track.create",
      geometry: "straight",
      points: [{ x: 0, y: 0 }, { x: 100, y: 0 }],
    });
    state = res1.state;

    // Track 2: vertical
    const res2 = executeCommand(state, {
      type: "track.create",
      geometry: "straight",
      points: [{ x: 50, y: -50 }, { x: 50, y: 50 }],
    });
    state = res2.state;

    // Station 1 on Track 1
    const res3 = executeCommand(state, {
      type: "station.createRange",
      name: "駅A",
      trackId: state.tracks[0].id,
      startPosition: { x: 10, y: 0 },
      endPosition: { x: 30, y: 0 },
    });
    state = res3.state;

    // Station 2 on Track 2
    const res4 = executeCommand(state, {
      type: "station.createRange",
      name: "駅B",
      trackId: state.tracks[1].id,
      startPosition: { x: 50, y: 20 },
      endPosition: { x: 50, y: 40 },
    });
    state = res4.state;

    // Inject malformed 90-degree junction
    state.junctions.push({
      id: "junction-bad",
      position: { x: 50, y: 0 },
      ports: [
        { trackId: state.tracks[0].id, location: "interior", distanceM: 50 },
        { trackId: state.tracks[1].id, location: "interior", distanceM: 50 },
      ],
    });

    // Attempting to route between Station A and Station B should fail because 90-degree junction is invalid
    expect(() => {
      findStationRoute(state, state.stations[0].id, state.stations[1].id);
    }).toThrow(/到達できません/);
  });
});
