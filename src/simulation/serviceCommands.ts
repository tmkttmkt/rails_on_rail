import type {
  CommercialStopType,
  OperationStopTime,
  ServiceCalendar,
  VehicleDutyAssignment,
} from "./serviceModel";

export interface CreateRouteStopPayload {
  stationId: string;
  trackId: string;
  stopPointId?: string;
  stopPointIndex?: number;
  commercialType: CommercialStopType;
  dwellSeconds?: number;
}

export interface CreateRouteLineSectionPayload {
  fromStopSequence: number;
  toStopSequence: number;
  lineId: string;
  serviceSystemId?: string;
}

export type ServiceDomainCommand =
  | { type: "line.create"; payload: { id?: string; name: string; code?: string; color: string; displayOrder?: number } }
  | { type: "line.update"; payload: { id: string; name?: string; code?: string; color?: string; displayOrder?: number } }
  | { type: "line.delete"; payload: { id: string } }
  | {
      type: "serviceSystem.create";
      payload: {
        id?: string;
        lineId: string;
        name: string;
        shortName?: string;
        color?: string;
        description?: string;
        displayOrder?: number;
      };
    }
  | {
      type: "serviceSystem.update";
      payload: {
        id: string;
        name?: string;
        shortName?: string;
        color?: string;
        description?: string;
        displayOrder?: number;
      };
    }
  | { type: "serviceSystem.delete"; payload: { id: string } }
  | {
      type: "route.create";
      payload: {
        id?: string;
        name: string;
        directionName: string;
        stops: CreateRouteStopPayload[];
        lineSections?: CreateRouteLineSectionPayload[];
      };
    }
  | {
      type: "route.update";
      payload: {
        id: string;
        name?: string;
        directionName?: string;
        stops?: CreateRouteStopPayload[];
        lineSections?: CreateRouteLineSectionPayload[];
      };
    }
  | { type: "route.delete"; payload: { id: string } }
  | {
      type: "route.duplicateReverse";
      payload: {
        sourceRouteId: string;
        name?: string;
        directionName?: string;
      };
    }
  | {
      type: "operation.create";
      payload: {
        id?: string;
        name: string;
        operationNumber?: string;
        routeId: string;
        calendar: ServiceCalendar;
        stopTimes: OperationStopTime[];
        description?: string;
      };
    }
  | {
      type: "operation.update";
      payload: {
        id: string;
        name?: string;
        operationNumber?: string;
        routeId?: string;
        calendar?: ServiceCalendar;
        stopTimes?: OperationStopTime[];
        description?: string;
        markReviewed?: boolean;
      };
    }
  | { type: "operation.delete"; payload: { id: string } }
  | {
      type: "operation.duplicate";
      payload: {
        sourceOperationId: string;
        name?: string;
        timeShiftMinutes?: number;
      };
    }
  | {
      type: "vehicleDuty.create";
      payload: {
        id?: string;
        name: string;
        assignments: VehicleDutyAssignment[];
        defaultFormationId?: string;
      };
    }
  | {
      type: "vehicleDuty.update";
      payload: {
        id: string;
        name?: string;
        assignments?: VehicleDutyAssignment[];
        defaultFormationId?: string;
      };
    }
  | { type: "vehicleDuty.delete"; payload: { id: string } }
  | { type: "vehicleDuty.assignFormation"; payload: { dutyId: string; formationId?: string } }
  | { type: "vehicleDuty.unassignFormation"; payload: { dutyId: string } }
  | {
      type: "vehicleDutyExecution.create";
      payload: {
        id?: string;
        vehicleDutyId: string;
        serviceDate: string;
        formationId?: string;
        cancelledOperationIds?: string[];
      };
    }
  | {
      type: "vehicleDutyExecution.replaceFormation";
      payload: {
        vehicleDutyId: string;
        serviceDate: string;
        formationId?: string;
      };
    }
  | {
      type: "vehicleDutyExecution.cancelOperation";
      payload: {
        vehicleDutyId: string;
        serviceDate: string;
        operationId: string;
      };
    }
  | {
      type: "execution.reserve";
      payload: {
        id?: string;
        operationId: string;
        serviceDate: string;
        dutyId?: string;
        formationId?: string;
        scheduledDepartureTimeMs?: number;
        requestedSpeedKph?: number;
      };
    }
  | { type: "execution.cancel"; payload: { executionId: string } }
  | {
      type: "execution.dispatch";
      payload: {
        id?: string;
        operationId: string;
        serviceDate?: string;
        dutyId?: string;
        formationId?: string;
        requestedSpeedKph?: number;
      };
    };
