export interface Device {
  id: string;
  name: string;
  type: 'mobile' | 'desktop';
  ip: string;
}

export interface Room {
  id: string;
  code: string;
  devices: Device[];
}

export interface TransferFile {
  id: string;
  name: string;
  size: number;
  type: string;
  data?: string;
}
