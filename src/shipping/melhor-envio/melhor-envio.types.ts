export interface MelhorEnvioTokenResponse {
  token_type: string;
  expires_in: number;
  access_token: string;
  refresh_token: string;
}

export interface MelhorEnvioQuoteProduct {
  id: string;
  width: number;
  height: number;
  length: number;
  weight: number;
  insurance_value: number;
  quantity: number;
}

export interface MelhorEnvioQuoteRequest {
  from: { postal_code: string };
  to: { postal_code: string };
  products: MelhorEnvioQuoteProduct[];
  options?: {
    receipt?: boolean;
    own_hand?: boolean;
  };
}

export interface MelhorEnvioQuoteService {
  id: number;
  name: string;
  price: string;
  custom_price: string;
  delivery_time: number;
  custom_delivery_time: number;
  company: {
    id: number;
    name: string;
    picture: string;
  };
}

export interface MelhorEnvioCartProduct {
  name: string;
  quantity: number;
  unitary_value: number;
}

export interface MelhorEnvioCartPayload {
  service: number;
  agency?: number | null;
  from: MelhorEnvioAddressPayload;
  to: MelhorEnvioAddressPayload;
  products: MelhorEnvioCartProduct[];
  volumes: MelhorEnvioVolume[];
  options?: {
    insurance_value?: number;
    receipt?: boolean;
    own_hand?: boolean;
    reverse?: boolean;
    non_commercial?: boolean;
    invoice?: { key: string };
  };
}

export interface MelhorEnvioAddressPayload {
  name: string;
  phone: string;
  email: string;
  document: string;
  company_document?: string;
  state_register?: string;
  address: string;
  complement?: string;
  number: string;
  district: string;
  city: string;
  state_abbr: string;
  country_id: string;
  postal_code: string;
  note?: string;
}

export interface MelhorEnvioVolume {
  height: number;
  width: number;
  length: number;
  weight: number;
}

export interface MelhorEnvioCartResponse {
  id: string;
  protocol: string;
  service_id: number;
  status: string;
  tracking?: string | null;
  self_tracking?: string | null;
}

export interface MelhorEnvioPrintResponse {
  url?: string;
  link?: string;
}

export interface MelhorEnvioTrackingEvent {
  date: string;
  status: string;
  observation: string;
  location?: string | null;
}

export interface MelhorEnvioWebhookPayload {
  event?: string;
  data?: {
    id?: string;
    protocol?: string;
    status?: string;
    tracking?: string;
    self_tracking?: string;
    orders?: Array<{ id: string; status: string; tracking?: string }>;
  };
}
