"use client";
import { useMemo, useState } from "react";

type Mode = "driving" | "rideshare" | "transit" | "walking" | "bicycling";

type SuccessResponse = {
  ok: true;
  inputsEcho: Record<string, unknown>;
  airport: { address: string; timeZoneId: string };
  origin: { address: string };
  flight: {
    departureLocal: string;
    requiredAirportArrivalUtc: number;
    airportBufferMin: number;
    weatherBufferMin: number;
    weatherReasons: string[];
  };
  recommendations: Array<{
    mode: string;
    leaveTimeDisplayLocal: string;
    travelDurationMin: number;
    buffersAppliedMin: number;
    notes?: string[];
  }>;
};

type ErrorResponse = { ok: false; error: string };

type ApiResponse =
  | SuccessResponse
  | ErrorResponse;

export default function Home() {
  const [origin, setOrigin] = useState("");
  const [airport, setAirport] = useState("");
  const [flightType, setFlightType] = useState<"domestic" | "international">(
    "domestic",
  );
  const [dt, setDt] = useState("");
  const [tsa, setTsa] = useState(true);
  const [bags, setBags] = useState(false);
  const [modes, setModes] = useState<Record<Mode, boolean>>({
    driving: true,
    rideshare: true,
    transit: true,
    walking: false,
    bicycling: false,
  });
  const [pickupBuf, setPickupBuf] = useState(8);
  const [parkingBuf, setParkingBuf] = useState(12);
  const [extraBuf, setExtraBuf] = useState(0);
  const [res, setRes] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const selectedModes = useMemo(
    () => Object.entries(modes).filter(([, v]) => v).map(([k]) => k as Mode),
    [modes],
  );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setRes(null);
    try {
      const resp = await fetch("/api/leave-time", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          originText: origin,
          airportText: airport,
          flightDateTimeLocal: dt,
          flightType,
          hasTsaPreCheck: tsa,
          hasCheckedBags: bags,
          modes: selectedModes,
          rideSharePickupBufferMin: pickupBuf,
          parkingBufferMin: parkingBuf,
          extraBufferMin: extraBuf,
          trafficModel: "best_guess",
        }),
      });
      const data = await resp.json();
      setRes(data);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Request failed';
      setRes({ ok: false, error: message });
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen p-6 md:p-10 lg:p-16 bg-gradient-to-b from-white to-slate-50">
      <div className="mx-auto max-w-5xl">
        <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
          When should I leave for my flight?
        </h1>
        <p className="text-slate-600 mt-2">
          Enter your trip details and we’ll compute the latest safe time to
          leave, factoring in airport buffers, live traffic, transit schedules,
          and weather.
        </p>

        <form onSubmit={submit} className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="md:col-span-1">
            <label className="block text-sm font-medium text-slate-700">
              Origin (address or place)
            </label>
            <input
              value={origin}
              onChange={(e) => setOrigin(e.target.value)}
              required
              placeholder="1600 Amphitheatre Pkwy, Mountain View"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="md:col-span-1">
            <label className="block text-sm font-medium text-slate-700">
              Airport (name, code, or address)
            </label>
            <input
              value={airport}
              onChange={(e) => setAirport(e.target.value)}
              required
              placeholder="San Francisco International Airport"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">
              Flight departure (airport local time)
            </label>
            <input
              type="datetime-local"
              value={dt}
              onChange={(e) => setDt(e.target.value)}
              required
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">
              Flight type
            </label>
            <select
              value={flightType}
              onChange={(e) => setFlightType(e.target.value as 'domestic' | 'international')}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="domestic">Domestic</option>
              <option value="international">International</option>
            </select>
          </div>
          <div className="flex items-center gap-4">
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={tsa}
                onChange={(e) => setTsa(e.target.checked)}
              />
              TSA PreCheck
            </label>
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={bags}
                onChange={(e) => setBags(e.target.checked)}
              />
              Checked bags
            </label>
          </div>
          <div className="md:col-span-2">
            <div className="text-sm font-medium text-slate-700 mb-2">
              Transport modes
            </div>
            <div className="flex flex-wrap gap-3">
              {([
                "driving",
                "rideshare",
                "transit",
                "walking",
                "bicycling",
              ] as Mode[]).map((m) => (
                <label
                  key={m}
                  className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 ${
                    modes[m]
                      ? "bg-blue-600 text-white border-blue-600"
                      : "border-slate-300 text-slate-700"
                  }`}
                >
                  <input
                    type="checkbox"
                    className="hidden"
                    checked={modes[m]}
                    onChange={() =>
                      setModes((prev) => ({ ...prev, [m]: !prev[m] }))
                    }
                  />
                  {m}
                </label>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:col-span-2">
            <div>
              <label className="block text-sm font-medium text-slate-700">
                Rideshare pickup buffer (min)
              </label>
              <input
                type="number"
                value={pickupBuf}
                onChange={(e) =>
                  setPickupBuf(parseInt(e.target.value || "0", 10))
                }
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">
                Parking buffer (min)
              </label>
              <input
                type="number"
                value={parkingBuf}
                onChange={(e) =>
                  setParkingBuf(parseInt(e.target.value || "0", 10))
                }
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">
                Extra airport buffer (min)
              </label>
              <input
                type="number"
                value={extraBuf}
                onChange={(e) => setExtraBuf(parseInt(e.target.value || "0", 10))}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </div>
          </div>
          <div className="md:col-span-2">
            <button
              disabled={loading}
              className="rounded-lg bg-blue-600 text-white px-5 py-2.5 font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? "Calculating…" : "Calculate leave times"}
            </button>
          </div>
        </form>

        {res && (
          <div className="mt-10">
            {res.ok ? (
              <div className="space-y-4">
                <div className="text-slate-700">
                  From <span className="font-semibold">{res.origin.address}</span>
                  {" "}to{" "}
                  <span className="font-semibold">{res.airport.address}</span>
                </div>
                <div className="rounded-xl border border-slate-200 divide-y">
                  {res.recommendations.length ? (
                    res.recommendations.map((r, idx) => (
                      <div
                        key={idx}
                        className="p-4 flex items-center justify-between"
                      >
                        <div>
                          <div className="text-slate-900 font-semibold capitalize">
                            {r.mode}
                          </div>
                          <div className="text-slate-600 text-sm">
                            Travel time ~ {r.travelDurationMin} min • Buffers {" "}
                            {r.buffersAppliedMin} min
                          </div>
                          {r.notes?.length ? (
                            <div className="text-xs text-slate-500 mt-1">
                              {r.notes.join(" • ")}
                            </div>
                          ) : null}
                        </div>
                        <div className="text-right">
                          <div className="text-slate-500 text-xs">
                            Leave no later than
                          </div>
                          <div className="text-lg font-semibold">
                            {r.leaveTimeDisplayLocal}
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="p-4 text-slate-700">
                      No feasible options found with given constraints.
                    </div>
                  )}
                </div>
                <div className="text-xs text-slate-500">
                  Airport buffer: {res.flight.airportBufferMin} min • Weather
                  buffer: {res.flight.weatherBufferMin} min{" "}
                  {res.flight.weatherReasons?.length
                    ? `(${res.flight.weatherReasons.join(", ")})`
                    : ""}
                </div>
              </div>
            ) : (
              <div className="rounded-lg bg-red-50 text-red-700 p-4">
                {res.error}
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
