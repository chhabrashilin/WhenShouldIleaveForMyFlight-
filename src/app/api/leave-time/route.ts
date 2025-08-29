import { NextRequest, NextResponse } from 'next/server';
import { DateTime } from 'luxon';

export const runtime = 'nodejs';

// Basic types to avoid external imports
export type LatLng = { lat: number; lng: number };
type GeocodeApiResult = { geometry: { location: LatLng }; formatted_address: string };

async function geocode(query: string, apiKey: string): Promise<{ location: LatLng; formattedAddress: string }[]> {
  const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
  url.searchParams.set('address', query);
  url.searchParams.set('key', apiKey);
  const res = await fetch(url);
  const data: { status: string; results: GeocodeApiResult[] } = await res.json();
  if (data.status !== 'OK') return [];
  return data.results.map((r) => ({ location: r.geometry.location, formattedAddress: r.formatted_address }));
}

async function timeZone(latLng: LatLng, timestampSec: number, apiKey: string): Promise<string | null> {
  const url = new URL('https://maps.googleapis.com/maps/api/timezone/json');
  url.searchParams.set('location', `${latLng.lat},${latLng.lng}`);
  url.searchParams.set('timestamp', String(timestampSec));
  url.searchParams.set('key', apiKey);
  const res = await fetch(url);
  const data = await res.json();
  if (data.status !== 'OK') return null;
  return data.timeZoneId as string;
}

type DistanceMatrixElement = {
  status: string;
  duration?: { value: number };
  duration_in_traffic?: { value: number };
  departure_time?: { value: number };
  arrival_time?: { value: number };
};
type DistanceMatrixResponse = {
  status: string;
  rows?: Array<{ elements?: DistanceMatrixElement[] }>;
};

async function distanceMatrix(options: {
  origin: LatLng;
  destination: LatLng;
  mode: 'driving' | 'transit' | 'walking' | 'bicycling';
  departureTimeSec?: number;
  arrivalTimeSec?: number;
  trafficModel?: 'best_guess' | 'pessimistic' | 'optimistic';
  apiKey: string;
}): Promise<DistanceMatrixResponse> {
  const url = new URL('https://maps.googleapis.com/maps/api/distancematrix/json');
  url.searchParams.set('origins', `${options.origin.lat},${options.origin.lng}`);
  url.searchParams.set('destinations', `${options.destination.lat},${options.destination.lng}`);
  url.searchParams.set('mode', options.mode);
  if (options.departureTimeSec !== undefined) url.searchParams.set('departure_time', String(options.departureTimeSec));
  if (options.arrivalTimeSec !== undefined) url.searchParams.set('arrival_time', String(options.arrivalTimeSec));
  if (options.trafficModel) url.searchParams.set('traffic_model', options.trafficModel);
  url.searchParams.set('key', options.apiKey);
  const res = await fetch(url);
  const data: DistanceMatrixResponse = await res.json();
  return data;
}

async function drivingDurationInTraffic(origin: LatLng, destination: LatLng, departureTimeSec: number, apiKey: string, trafficModel: 'best_guess' | 'pessimistic' | 'optimistic' = 'best_guess'): Promise<number | null> {
  const data = await distanceMatrix({ origin, destination, mode: 'driving', departureTimeSec, trafficModel, apiKey });
  if (data.status !== 'OK') return null;
  const el = data.rows?.[0]?.elements?.[0];
  if (!el || el.status !== 'OK') return null;
  return el.duration_in_traffic?.value ?? el.duration?.value ?? null;
}

async function transitPlanForArrival(origin: LatLng, destination: LatLng, arrivalTimeSec: number, apiKey: string): Promise<{ durationSec: number; departureTimeSec: number; arrivalTimeSec: number } | null> {
  const data = await distanceMatrix({ origin, destination, mode: 'transit', arrivalTimeSec, apiKey });
  if (data.status !== 'OK') return null;
  const el = data.rows?.[0]?.elements?.[0];
  if (!el || el.status !== 'OK') return null;
  const duration: number | undefined = el.duration?.value;
  const dep: number | undefined = el.departure_time?.value;
  const arr: number | undefined = el.arrival_time?.value;
  if (duration == null || dep == null || arr == null) return null;
  return { durationSec: duration, departureTimeSec: dep, arrivalTimeSec: arr };
}

async function simpleDuration(origin: LatLng, destination: LatLng, mode: 'walking' | 'bicycling', apiKey: string): Promise<number | null> {
  const data = await distanceMatrix({ origin, destination, mode, apiKey });
  if (data.status !== 'OK') return null;
  const el = data.rows?.[0]?.elements?.[0];
  if (!el || el.status !== 'OK') return null;
  return el.duration?.value ?? null;
}

function computeAirportBufferMinutes(options: { flightType: 'domestic' | 'international'; hasTsaPre: boolean; hasBags: boolean; extra?: number }): number {
  const base = options.flightType === 'international' ? 180 : 120;
  const security = options.flightType === 'international' ? 60 : 45;
  const precheckDelta = options.hasTsaPre ? -20 : 0;
  const bagDrop = options.hasBags ? 20 : 0;
  const extra = options.extra ?? 0;
  return Math.max(base + security + precheckDelta + bagDrop + extra, 30);
}

function pickupOrParkingBufferMinutes(mode: 'rideshare' | 'driving' | 'transit' | 'walking' | 'bicycling', rideSharePickupBufferMin?: number, parkingBufferMin?: number): number {
  if (mode === 'rideshare') return Math.max(rideSharePickupBufferMin ?? 8, 0);
  if (mode === 'driving') return Math.max(parkingBufferMin ?? 12, 0);
  return 0;
}

async function assessWeatherBuffer(lat: number, lng: number, isoHour: string): Promise<{ addedBufferMin: number; reason: string[] }> {
  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.searchParams.set('latitude', String(lat));
  url.searchParams.set('longitude', String(lng));
  url.searchParams.set('hourly', 'precipitation_probability,precipitation,weathercode,windspeed_10m,windgusts_10m');
  url.searchParams.set('timezone', 'UTC');
  const res = await fetch(url);
  if (!res.ok) return { addedBufferMin: 0, reason: ['weather fetch failed'] };
  const data = await res.json();
  const times: string[] = data.hourly?.time ?? [];
  const idx = times.indexOf(isoHour);
  if (idx === -1) return { addedBufferMin: 0, reason: [] };
  const precipProb: number = data.hourly.precipitation_probability?.[idx] ?? 0;
  const precip: number = data.hourly.precipitation?.[idx] ?? 0;
  const windGust: number = data.hourly.windgusts_10m?.[idx] ?? 0;
  let added = 0;
  const reason: string[] = [];
  if (precipProb >= 60 || precip >= 1.0) { added += 10; reason.push('precipitation expected'); }
  if (windGust >= 40) { added += 10; reason.push('high wind gusts'); }
  return { addedBufferMin: added, reason };
}

export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!apiKey) throw new Error('Missing GOOGLE_MAPS_API_KEY');
    const body = await req.json();

    const originText: string = body.originText;
    const airportText: string = body.airportText;
    const flightDateTimeLocal: string = body.flightDateTimeLocal; // YYYY-MM-DDTHH:mm in airport local time
    const flightType: 'domestic' | 'international' = body.flightType;
    const hasTsaPreCheck: boolean = !!body.hasTsaPreCheck;
    const hasCheckedBags: boolean = !!body.hasCheckedBags;
    const modes: Array<'driving' | 'transit' | 'walking' | 'bicycling' | 'rideshare'> = body.modes ?? ['driving'];
    const rideSharePickupBufferMin: number | undefined = body.rideSharePickupBufferMin;
    const parkingBufferMin: number | undefined = body.parkingBufferMin;
    const extraBufferMin: number | undefined = body.extraBufferMin;
    const trafficModel: 'best_guess' | 'pessimistic' | 'optimistic' = body.trafficModel ?? 'best_guess';

    const [originMatches, airportMatches] = await Promise.all([
      geocode(originText, apiKey),
      geocode(airportText, apiKey),
    ]);
    if (!originMatches.length) throw new Error('Could not resolve origin');
    if (!airportMatches.length) throw new Error('Could not resolve airport');

    const origin = { address: originMatches[0].formattedAddress, latLng: originMatches[0].location };
    const airport = { address: airportMatches[0].formattedAddress, latLng: airportMatches[0].location };

    const tzId = await timeZone(airport.latLng, Math.floor(Date.now() / 1000), apiKey);
    if (!tzId) throw new Error('Could not determine airport time zone');

    const local = DateTime.fromISO(flightDateTimeLocal, { zone: tzId });
    if (!local.isValid) throw new Error('Invalid flight date/time');
    const flightUtc = local.toUTC();

    const airportBufferMin = computeAirportBufferMinutes({
      flightType,
      hasTsaPre: hasTsaPreCheck,
      hasBags: hasCheckedBags,
      extra: extraBufferMin,
    });

    const weather = await assessWeatherBuffer(
      origin.latLng.lat,
      origin.latLng.lng,
      flightUtc.startOf('hour').toISO({ suppressMilliseconds: true })!,
    );

    const requiredAirportArrivalUtc = flightUtc.minus({ minutes: airportBufferMin + weather.addedBufferMin });
    const latestArrivalSec = Math.floor(requiredAirportArrivalUtc.toSeconds());

    const recs: Array<{ mode: string; leaveTimeUtc: number; leaveTimeDisplayLocal: string; travelDurationMin: number; buffersAppliedMin: number; notes?: string[] }> = [];

    // Driving
    if (modes.includes('driving')) {
      const parkingBuf = pickupOrParkingBufferMinutes('driving', undefined, parkingBufferMin);
      const nowSec = Math.floor(Date.now() / 1000);
      let lo = nowSec;
      let hi = latestArrivalSec - parkingBuf * 60;
      let best: { leave: number; dur: number } | null = null;
      for (let i = 0; i < 8 && lo <= hi; i++) {
        const mid = Math.floor((lo + hi) / 2);
        const dur = await drivingDurationInTraffic(origin.latLng, airport.latLng, mid, apiKey, trafficModel);
        if (dur == null) break;
        const arrival = mid + dur;
        if (arrival <= latestArrivalSec - parkingBuf * 60) {
          best = { leave: mid, dur };
          lo = mid + 60;
        } else {
          hi = mid - 60;
        }
      }
      if (best) {
        const leaveDisplay = DateTime.fromSeconds(best.leave).setZone(DateTime.local().zone).toFormat('EEE, dd LLL yyyy • HH:mm ZZZZ');
        recs.push({
          mode: 'driving',
          leaveTimeUtc: best.leave,
          leaveTimeDisplayLocal: leaveDisplay,
          travelDurationMin: Math.round(best.dur / 60),
          buffersAppliedMin: airportBufferMin + weather.addedBufferMin + parkingBuf,
          notes: ['Includes parking buffer of ' + parkingBuf + ' min'],
        });
      }
    }

    // Rideshare
    if (modes.includes('rideshare')) {
      const pickupBuf = pickupOrParkingBufferMinutes('rideshare', rideSharePickupBufferMin, undefined);
      const nowSec = Math.floor(Date.now() / 1000);
      let lo = nowSec;
      let hi = latestArrivalSec - pickupBuf * 60;
      let best: { leave: number; dur: number } | null = null;
      for (let i = 0; i < 8 && lo <= hi; i++) {
        const mid = Math.floor((lo + hi) / 2);
        const dur = await drivingDurationInTraffic(origin.latLng, airport.latLng, mid, apiKey, trafficModel);
        if (dur == null) break;
        const arrival = mid + dur;
        if (arrival <= latestArrivalSec - pickupBuf * 60) {
          best = { leave: mid, dur };
          lo = mid + 60;
        } else {
          hi = mid - 60;
        }
      }
      if (best) {
        const leaveDisplay = DateTime.fromSeconds(best.leave).setZone(DateTime.local().zone).toFormat('EEE, dd LLL yyyy • HH:mm ZZZZ');
        recs.push({
          mode: 'rideshare',
          leaveTimeUtc: best.leave,
          leaveTimeDisplayLocal: leaveDisplay,
          travelDurationMin: Math.round(best.dur / 60),
          buffersAppliedMin: airportBufferMin + weather.addedBufferMin + pickupBuf,
          notes: ['Includes pickup buffer of ' + pickupBuf + ' min'],
        });
      }
    }

    // Transit
    if (modes.includes('transit')) {
      const plan = await transitPlanForArrival(origin.latLng, airport.latLng, latestArrivalSec, apiKey);
      if (plan) {
        const leaveDisplay = DateTime.fromSeconds(plan.departureTimeSec).setZone(DateTime.local().zone).toFormat('EEE, dd LLL yyyy • HH:mm ZZZZ');
        recs.push({
          mode: 'transit',
          leaveTimeUtc: plan.departureTimeSec,
          leaveTimeDisplayLocal: leaveDisplay,
          travelDurationMin: Math.round(plan.durationSec / 60),
          buffersAppliedMin: airportBufferMin + weather.addedBufferMin,
        });
      }
    }

    // Walking / Bicycling
    for (const m of ['walking', 'bicycling'] as const) {
      if (modes.includes(m)) {
        const dur = await simpleDuration(origin.latLng, airport.latLng, m, apiKey);
        if (dur != null) {
          const leaveSec = latestArrivalSec - dur;
          const leaveDisplay = DateTime.fromSeconds(leaveSec).setZone(DateTime.local().zone).toFormat('EEE, dd LLL yyyy • HH:mm ZZZZ');
          recs.push({
            mode: m,
            leaveTimeUtc: leaveSec,
            leaveTimeDisplayLocal: leaveDisplay,
            travelDurationMin: Math.round(dur / 60),
            buffersAppliedMin: airportBufferMin + weather.addedBufferMin,
          });
        }
      }
    }

    recs.sort((a, b) => b.leaveTimeUtc - a.leaveTimeUtc);

    return NextResponse.json({
      ok: true,
      inputsEcho: body,
      airport: { address: airport.address, timeZoneId: tzId },
      origin: { address: origin.address },
      flight: {
        departureLocal: local.setZone(tzId).toISO(),
        requiredAirportArrivalUtc: latestArrivalSec,
        airportBufferMin,
        weatherBufferMin: weather.addedBufferMin,
        weatherReasons: weather.reason,
      },
      recommendations: recs,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}

