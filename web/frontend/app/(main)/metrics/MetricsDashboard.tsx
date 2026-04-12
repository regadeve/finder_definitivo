"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type OverviewMetrics = {
  totalRegisteredUsers: number;
  newUsersToday: number;
  newUsersLast7Days: number;
  newUsersLast30Days: number;
  activeUsersNow: number;
  activeUsersToday: number;
  activeUsersLast7Days: number;
};

type GrowthPoint = {
  day: string;
  registeredUsers: number;
  activeUsers: number;
};

function panel(extra = "") {
  return `rounded-[28px] border border-white/10 bg-white/[0.04] shadow-[0_24px_60px_rgba(0,0,0,0.35)] backdrop-blur-xl ${extra}`;
}

function formatDay(value: string) {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    month: "short",
  }).format(date);
}

function MetricCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: number;
  hint: string;
}) {
  return (
    <article className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
      <p className="text-xs uppercase tracking-[0.22em] text-zinc-500">{label}</p>
      <p className="mt-3 text-4xl font-semibold text-white">{value}</p>
      <p className="mt-2 text-sm leading-6 text-zinc-400">{hint}</p>
    </article>
  );
}

export default function MetricsDashboard({
  overview,
  growth,
}: {
  overview: OverviewMetrics;
  growth: GrowthPoint[];
}) {
  return (
    <>
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Usuarios totales" value={overview.totalRegisteredUsers} hint="Total de cuentas registradas en Supabase Auth + profiles." />
        <MetricCard label="Nuevos hoy" value={overview.newUsersToday} hint="Altas registradas durante el dia actual." />
        <MetricCard label="Nuevos 7 dias" value={overview.newUsersLast7Days} hint="Usuarios creados durante la ultima semana." />
        <MetricCard label="Nuevos 30 dias" value={overview.newUsersLast30Days} hint="Crecimiento acumulado del ultimo mes." />
        <MetricCard label="Activos ahora" value={overview.activeUsersNow} hint="Usuarios con last_seen_at en los ultimos 15 minutos." />
        <MetricCard label="Activos hoy" value={overview.activeUsersToday} hint="Usuarios que han tenido presencia durante hoy." />
        <MetricCard label="Activos 7 dias" value={overview.activeUsersLast7Days} hint="Usuarios con actividad en la ultima semana." />
      </section>

      <section className="mt-8 grid gap-6 xl:grid-cols-2">
        <article className={panel("p-5 md:p-6")}>
          <div className="mb-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-cyan-300/80">
              Growth
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-white">Crecimiento diario de usuarios</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">
              Serie diaria de registros nuevos devuelta por <code>get_admin_metrics_growth(30)</code>.
            </p>
          </div>

          <div className="h-[320px] w-full">
            <ResponsiveContainer>
              <LineChart data={growth}>
                <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
                <XAxis
                  dataKey="day"
                  tickFormatter={formatDay}
                  stroke="rgba(161,161,170,0.9)"
                  tickLine={false}
                  axisLine={false}
                  minTickGap={20}
                />
                <YAxis stroke="rgba(161,161,170,0.9)" tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip
                  contentStyle={{
                    borderRadius: 18,
                    border: "1px solid rgba(255,255,255,0.12)",
                    background: "rgba(9,15,28,0.94)",
                    color: "#f4f4f5",
                  }}
                  labelFormatter={(value) => formatDay(String(value))}
                />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="registeredUsers"
                  name="Nuevos usuarios"
                  stroke="#22d3ee"
                  strokeWidth={3}
                  dot={{ r: 2 }}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </article>

        <article className={panel("p-5 md:p-6")}>
          <div className="mb-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-cyan-300/80">
              Activity
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-white">Actividad diaria de usuarios</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">
              Barras diarias usando los usuarios activos reportados por la RPC de crecimiento.
            </p>
          </div>

          <div className="h-[320px] w-full">
            <ResponsiveContainer>
              <BarChart data={growth}>
                <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
                <XAxis
                  dataKey="day"
                  tickFormatter={formatDay}
                  stroke="rgba(161,161,170,0.9)"
                  tickLine={false}
                  axisLine={false}
                  minTickGap={20}
                />
                <YAxis stroke="rgba(161,161,170,0.9)" tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip
                  contentStyle={{
                    borderRadius: 18,
                    border: "1px solid rgba(255,255,255,0.12)",
                    background: "rgba(9,15,28,0.94)",
                    color: "#f4f4f5",
                  }}
                  labelFormatter={(value) => formatDay(String(value))}
                />
                <Legend />
                <Bar dataKey="activeUsers" name="Usuarios activos" fill="#60a5fa" radius={[10, 10, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </article>
      </section>
    </>
  );
}
