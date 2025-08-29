This app calculates the latest safe time to leave for your flight, factoring in:

- Airport buffers (domestic vs international, TSA PreCheck, checked bags)
- Live traffic for driving and rideshare
- Transit schedules (arrival planning)
- Weather-based delay buffer

Stack: Next.js (App Router), TypeScript, TailwindCSS, Luxon.

## Getting Started

Setup: copy `.env.local.example` to `.env.local` and set `GOOGLE_MAPS_API_KEY` with these APIs enabled:

- Geocoding API
- Distance Matrix API
- Time Zone API

Then run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

Use the form on the homepage. Enter origin, airport, flight time (airport local), choose flight type and modes, and click Calculate.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

Notes

- Weather buffer uses Open-Meteo and adds minutes for precipitation and high winds.
- Driving and rideshare use a small binary search over departure times to meet your arrival deadline.
- Transit uses arrival-time planning to pick a timetable-aligned departure.
