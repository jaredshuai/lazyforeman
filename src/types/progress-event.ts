/**
 * Progress Log 事件类型定义
 */

export type ProgressEvent =
	| { type: "mission_accepted"; missionId: string; timestamp: string }
	| {
			type: "mission_run_started";
			missionId: string;
			resumeCount: number;
			timestamp: string;
	  }
	| {
			type: "worker_selected_feature";
			featureId: string;
			timestamp: string;
	  }
	| {
			type: "worker_started";
			featureId: string;
			workerSessionId: string;
			timestamp: string;
	  }
	| {
			type: "worker_completed";
			featureId: string;
			workerSessionId: string;
			success: boolean;
			timestamp: string;
	  }
	| {
			type: "handoff_items_dismissed";
			featureId: string;
			issueIds: string[];
			timestamp: string;
	  }
	| {
			type: "milestone_validation_triggered";
			milestone: string;
			timestamp: string;
	  };
