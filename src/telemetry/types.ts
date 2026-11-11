export type CoreCluster = 'LITTLE' | 'BIG' | 'PRIME';

export interface CoreStats {
  id: number;
  cluster: CoreCluster;
  governor: string;
  minFreq: number;
  maxFreq: number;
  curFreq: number;
  temp: number;
  usage: number;
}

export interface GpuStats {
  usage: number;
  curFreq: number;
  minFreq: number;
  maxFreq: number;
  model: string;
  governor: string;
  availGovs: string[];
  availFreqs: number[];
  hwMin: number;
  hwMax: number;
  temp: number;
}

export interface ClusterPolicyData {
  policyId: string;
  hwMin: number;
  hwMax: number;
  governor: string;
  availGovs: string[];
  availFreqs: number[];
}

export interface TelemetrySnapshot {
  cores: CoreStats[];
  totalLoad: number;
  serviceRunning: boolean;
  bypassActive: boolean;
  gpu: GpuStats;
  clusters: Record<string, ClusterPolicyData>;
}

export interface IoBlockDevice {
  dev: string;
  active: string;
  avail: string[];
  defaultSched: string;
  customSched: string | null;
}

export interface IoStats {
  enabled: boolean;
  applyBoot: boolean;
  defaultsMap: Record<string, string>;
  customMap: Record<string, string>;
  blocks: IoBlockDevice[];
}

export interface NetStats {
  enabled: boolean;
  applyBoot: boolean;
  currentAlgo: string;
  defaultAlgo: string;
  availAlgos: string[];
  customAlgo: string | null;
}

export interface CpuConfigLimits {
  min?: number;
  max?: number;
  gov?: string;
}

export interface GpuConfigLimits {
  min?: number;
  max?: number;
  gov?: string;
}
