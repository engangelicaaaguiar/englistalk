'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  CEFR_DEFAULT_TTS_SPEED,
  CEFR_LEVEL_ORDER,
  CEFRLevel,
  LearningModule,
  clampTtsSpeed,
} from '../../../lib/cefr';
import {
  UserProgressRow,
  fetchOrCreateProgress,
  saveProgress,
} from '../../../lib/progressStore';
import { getSupabaseClient } from '../../../lib/supabaseClient';

const moduleOptions: { value: LearningModule; label: string }[] = [
  { value: 'Daily_Conversation', label: 'Daily Conversation' },
  { value: 'Travel_Logistics', label: 'Travel Logistics' },
  { value: 'Work_Communication', label: 'Work Communication' },
  { value: 'Social_Small_Talk', label: 'Social Small Talk' },
  { value: 'Exam_Preparation', label: 'Exam Preparation' },
];

export default function SettingsPage() {
  const router = useRouter();
  const [fullName, setFullName] = useState('');
  const [progress, setProgress] = useState<UserProgressRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('');

  useEffect(() => {
    const load = async () => {
      const supabase = getSupabaseClient();
      const { data: sessionData } = await supabase.auth.getSession();
      const user = sessionData.session?.user;

      if (!user) {
        router.replace('/auth/login');
        return;
      }

      const { data: userData } = await supabase.auth.getUser();
      const meta = userData.user?.user_metadata || {};
      setFullName((meta.full_name as string) || '');

      const row = await fetchOrCreateProgress(user.id, meta.level as string | undefined);

      const legacyVoice = meta.voice === 'en-US' || meta.voice === 'en-GB' ? meta.voice : row.settings.voice;
      const hydrated: UserProgressRow = {
        ...row,
        settings: {
          ...row.settings,
          voice: legacyVoice,
        },
      };

      setProgress(hydrated);
      setLoading(false);
    };

    void load();
  }, [router]);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!progress) return;

    setSaving(true);
    setStatus('');

    try {
      const supabase = getSupabaseClient();
      const normalized: UserProgressRow = {
        ...progress,
        settings: {
          ...progress.settings,
          tts_speed: clampTtsSpeed(progress.settings.tts_speed),
        },
      };

      const { error: metaError } = await supabase.auth.updateUser({
        data: {
          full_name: fullName,
          level: normalized.current_level,
          module: normalized.current_module,
          voice: normalized.settings.voice,
          correction_mode: normalized.settings.correction_mode,
        },
      });

      if (metaError) throw metaError;

      await saveProgress(normalized);
      setProgress(normalized);
      setStatus('Preferencias salvas com sucesso.');
    } catch (err: any) {
      setStatus(err?.message || 'Nao foi possivel salvar as preferencias.');
    } finally {
      setSaving(false);
    }
  };

  if (loading || !progress) {
    return (
      <div className="mx-auto max-w-2xl rounded-2xl border bg-white p-6 shadow-sm">
        <p className="text-sm text-slate-600">Carregando configuracoes...</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl rounded-2xl border bg-white p-6 shadow-sm">
      <h1 className="text-2xl font-bold">Configuracoes de Fluencia</h1>
      <p className="mt-1 text-sm text-slate-600">Nivel CEFR, modulo ativo e estilo da professora IA.</p>

      <form onSubmit={save} className="mt-6 grid gap-4">
        <input
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          className="rounded-xl border px-3 py-2"
          placeholder="Nome completo"
        />

        <label className="grid gap-1 text-sm">
          <span className="font-medium text-slate-700">Nivel atual (CEFR)</span>
          <select
            value={progress.current_level}
            onChange={(e) => {
              const nextLevel = e.target.value as CEFRLevel;
              setProgress((prev) =>
                prev
                  ? {
                      ...prev,
                      current_level: nextLevel,
                      settings: {
                        ...prev.settings,
                        tts_speed: CEFR_DEFAULT_TTS_SPEED[nextLevel],
                      },
                    }
                  : prev,
              );
            }}
            className="rounded-xl border px-3 py-2"
          >
            {CEFR_LEVEL_ORDER.map((level) => (
              <option key={level} value={level}>
                {level}
              </option>
            ))}
          </select>
        </label>

        <label className="grid gap-1 text-sm">
          <span className="font-medium text-slate-700">Modulo atual</span>
          <select
            value={progress.current_module}
            onChange={(e) =>
              setProgress((prev) =>
                prev
                  ? {
                      ...prev,
                      current_module: e.target.value as LearningModule,
                    }
                  : prev,
              )
            }
            className="rounded-xl border px-3 py-2"
          >
            {moduleOptions.map((mod) => (
              <option key={mod.value} value={mod.value}>
                {mod.label}
              </option>
            ))}
          </select>
        </label>

        <label className="grid gap-2 text-sm">
          <span className="font-medium text-slate-700">
            Velocidade TTS: {progress.settings.tts_speed.toFixed(2)}x
          </span>
          <input
            type="range"
            min="0.6"
            max="1.2"
            step="0.05"
            value={progress.settings.tts_speed}
            onChange={(e) =>
              setProgress((prev) =>
                prev
                  ? {
                      ...prev,
                      settings: {
                        ...prev.settings,
                        tts_speed: clampTtsSpeed(Number(e.target.value)),
                      },
                    }
                  : prev,
              )
            }
          />
        </label>

        <label className="grid gap-1 text-sm">
          <span className="font-medium text-slate-700">Accent / voice context</span>
          <select
            value={progress.settings.voice}
            onChange={(e) =>
              setProgress((prev) =>
                prev
                  ? {
                      ...prev,
                      settings: {
                        ...prev.settings,
                        voice: e.target.value === 'en-GB' ? 'en-GB' : 'en-US',
                      },
                    }
                  : prev,
              )
            }
            className="rounded-xl border px-3 py-2"
          >
            <option value="en-US">English (US)</option>
            <option value="en-GB">English (UK)</option>
          </select>
        </label>

        <label className="grid gap-1 text-sm">
          <span className="font-medium text-slate-700">Modo de correcao</span>
          <select
            value={progress.settings.correction_mode}
            onChange={(e) =>
              setProgress((prev) =>
                prev
                  ? {
                      ...prev,
                      settings: {
                        ...prev.settings,
                        correction_mode: e.target.value === 'strict' ? 'strict' : 'friendly',
                      },
                    }
                  : prev,
              )
            }
            className="rounded-xl border px-3 py-2"
          >
            <option value="friendly">Friendly</option>
            <option value="strict">Strict</option>
          </select>
        </label>

        <label className="inline-flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={progress.settings.show_subtitles}
            onChange={(e) =>
              setProgress((prev) =>
                prev
                  ? {
                      ...prev,
                      settings: {
                        ...prev.settings,
                        show_subtitles: e.target.checked,
                      },
                    }
                  : prev,
              )
            }
          />
          Mostrar legendas durante a aula
        </label>

        <div className="rounded-xl border bg-slate-50 p-3 text-xs text-slate-600">
          <p>XP: {progress.xp_points}</p>
          <p>Streak: {progress.streak_days} dias</p>
        </div>

        <button
          disabled={saving}
          className="rounded-xl bg-slate-900 py-2 font-semibold text-white disabled:opacity-60"
        >
          {saving ? 'Salvando...' : 'Salvar'}
        </button>
      </form>

      {status && <p className="mt-3 text-sm text-slate-600">{status}</p>}
    </div>
  );
}
