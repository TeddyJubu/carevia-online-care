export const API_BASE = 'http://localhost:4000';

const FALLBACK = {
  AUTH_REQUIRED: 'Log in or register to book a consultation.',
  AUDIO_DISABLED: 'Audio consultations are not available.',
  VIDEO_DISABLED: 'Video is off until an administrator saves a Daily API key.',
  SLOT_TAKEN: 'That time was just booked. Choose another time.',
};

export class ApiError extends Error {
  constructor(message, { status = 0, code = '', data = null } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.data = data;
  }
}

function asList(data, keys) {
  if (Array.isArray(data)) return data;
  if (!data || typeof data !== 'object') return [];
  for (const key of keys) {
    if (Array.isArray(data[key])) return data[key];
  }
  return [];
}

function readError(data, text, status) {
  if (data && typeof data === 'object') {
    const nested = data.error && typeof data.error === 'object' ? data.error : null;
    const code = typeof data.error === 'string' ? data.error : nested?.code || data.code || '';
    const message =
      data.message ||
      nested?.message ||
      FALLBACK[code] ||
      (typeof data.error === 'string' ? FALLBACK[data.error] || data.error : '') ||
      text ||
      `Request failed (${status})`;
    return { code, message: String(message) };
  }
  return { code: '', message: text || `Request failed (${status})` };
}

export async function request(path, { method = 'GET', body, allowStatuses = [] } = {}) {
  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method,
      credentials: 'include',
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError('The Carevia server is not reachable.', { code: 'NETWORK' });
  }

  const text = await response.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }

  if (!response.ok && !allowStatuses.includes(response.status)) {
    const parsed = readError(data, text.slice(0, 280), response.status);
    throw new ApiError(parsed.message, {
      status: response.status,
      code: parsed.code,
      data,
    });
  }

  return { status: response.status, data };
}

export function normalizeUser(data) {
  const user = data?.user || data?.patient || data?.account || data;
  if (!user || typeof user !== 'object' || Array.isArray(user)) return null;
  if (!user.email && !user.firstName && !user.id) return null;
  return {
    id: user.id,
    firstName: user.firstName || user.first_name || user.first || '',
    lastName: user.lastName || user.last_name || user.last || '',
    email: user.email || '',
    role: user.role || 'patient',
  };
}

export function normalizeGroups(data) {
  const raw = asList(data, ['groups', 'services', 'items', 'data', 'results']);
  if (!raw.length) return [];
  const grouped = raw.some((item) => Array.isArray(item?.services) || Array.isArray(item?.items));
  if (grouped) {
    return raw.map((group, index) => ({
      id: group.id ?? group.group ?? index,
      name: group.name || group.title || `Services ${index + 1}`,
      blurb: group.blurb || group.description || '',
      icon: group.icon || '',
      services: (group.services || group.items || [])
        .map((service) => (typeof service === 'string' ? service : service?.name || service?.title || ''))
        .filter(Boolean),
    }));
  }

  const map = new Map();
  for (const service of raw) {
    const name = typeof service === 'string' ? service : service?.name || service?.title;
    if (!name) continue;
    const groupName =
      (typeof service === 'object' && (service.groupName || service.category || service.group)) || 'Services';
    const key = String(groupName);
    if (!map.has(key)) map.set(key, { id: key, name: key, blurb: '', icon: '', services: [] });
    map.get(key).services.push(name);
  }
  return [...map.values()];
}

export function normalizeDoctor(doctor) {
  if (!doctor || typeof doctor !== 'object') return null;
  const source = doctor.doctor || doctor;
  const languages = Array.isArray(source.languages)
    ? source.languages.filter(Boolean).join(' · ')
    : source.languages || '';
  const feeValue = source.fee ?? source.price ?? source.consultationFee;
  const fee = feeValue == null || feeValue === '' ? null : Number(feeValue);
  const services = Array.isArray(source.services)
    ? source.services.map((service) => (typeof service === 'string' ? service : service?.name)).filter(Boolean)
    : source.service
      ? [source.service]
      : [];
  let experience = source.experience ?? '';
  if (typeof experience === 'number') experience = `${experience} years`;
  return {
    id: source.id,
    name: source.name || '',
    initials: source.initials || '',
    specialty: source.specialty || '',
    languages,
    fee: Number.isFinite(fee) ? fee : null,
    experience: String(experience || ''),
    approach: source.approach || '',
    education: source.education || '',
    cedula: source.cedula || source.registration || '',
    services,
    group: source.group,
    firstDay: source.firstDay || source.nextAvailable || '',
  };
}

export function normalizeDoctors(data) {
  return asList(data, ['doctors', 'items', 'results', 'data'])
    .map((doctor) => normalizeDoctor(doctor))
    .filter(Boolean);
}

export function normalizeSlots(data) {
  return asList(data, ['slots', 'items', 'results', 'data'])
    .map((slot) => {
      if (typeof slot === 'string') return slot;
      return slot?.label || slot?.slot || slot?.display || slot?.name || '';
    })
    .filter(Boolean);
}

export function normalizeAppointment(data) {
  const appointment = data?.appointment || data;
  if (!appointment || typeof appointment !== 'object') return null;
  const id = appointment.id ?? appointment.appointmentId;
  if (id == null) return null;
  return {
    id,
    doctorId: appointment.doctorId,
    service: appointment.service || '',
    slot: appointment.slot || '',
    channel: appointment.channel || 'video',
    status: appointment.status || '',
  };
}

export function joinDetails(data) {
  const nested = data?.token && typeof data.token === 'object' ? data.token : null;
  const bag = { ...(data || {}), ...(nested || {}) };
  const tokenValue = nested ? nested.token || nested.meetingToken : bag.token;
  const token = typeof tokenValue === 'string' ? tokenValue : bag.meetingToken || bag.meeting_token || '';
  const urlValue = bag.url || bag.roomUrl || bag.room_url || bag.joinUrl || bag.join_url || bag.tokenUrl || '';
  let url = typeof urlValue === 'string' && /^https?:\/\//i.test(urlValue) ? urlValue : '';
  if (url && typeof token === 'string' && token && !url.includes(token)) {
    try {
      const parsed = new URL(url);
      if (!parsed.searchParams.has('t')) parsed.searchParams.set('t', token);
      url = parsed.toString();
    } catch {
      url = '';
    }
  }
  return {
    token: typeof token === 'string' ? token : '',
    url,
  };
}

export function apiId(id) {
  return /^\d+$/.test(String(id)) ? Number(id) : id;
}

export function doctorQuery(filters) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === null || value === '' || value === 'any') continue;
    params.set(key, String(value));
  }
  const query = params.toString();
  return query ? `?${query}` : '';
}

export const api = {
  async me() {
    const { status, data } = await request('/api/auth/me', { allowStatuses: [401] });
    if (status === 401) return null;
    return normalizeUser(data);
  },
  async register(body) {
    const { data } = await request('/api/auth/register', { method: 'POST', body });
    return normalizeUser(data);
  },
  async login(body) {
    const { data } = await request('/api/auth/login', { method: 'POST', body });
    return normalizeUser(data);
  },
  logout() {
    return request('/api/auth/logout', { method: 'POST' });
  },
  async services() {
    const { data } = await request('/api/services');
    return normalizeGroups(data);
  },
  async doctors(filters) {
    const { data } = await request(`/api/doctors${doctorQuery(filters)}`);
    return normalizeDoctors(data);
  },
  async doctor(id) {
    const { data } = await request(`/api/doctors/${encodeURIComponent(id)}`);
    return normalizeDoctor(data?.doctor || data);
  },
  async slots(id) {
    const { data } = await request(`/api/doctors/${encodeURIComponent(id)}/slots`);
    return normalizeSlots(data);
  },
  async book(body) {
    const { data } = await request('/api/appointments', { method: 'POST', body });
    return normalizeAppointment(data);
  },
  async videoStatus() {
    const { data } = await request('/api/video/status');
    return { enabled: Boolean(data?.enabled) };
  },
  async videoToken(id) {
    const { data } = await request(`/api/appointments/${encodeURIComponent(id)}/video-token`, {
      method: 'POST',
    });
    return joinDetails(data);
  },
};

export function plainMessage(error, fallback) {
  const message = String(error?.message || '').replace(/\s+/g, ' ').trim();
  if (!message || message.length > 280 || /<[a-z!/]/i.test(message)) return fallback;
  return message;
}
