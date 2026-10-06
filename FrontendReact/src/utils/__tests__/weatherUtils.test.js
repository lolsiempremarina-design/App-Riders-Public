import { describe, it, expect } from 'vitest';
import { buildWeatherUrl, classifyWeather, formatTemperature } from '../weatherUtils';

describe('weatherUtils', () => {
  it('costruisce l\'URL di Open-Meteo con le coordinate reali', () => {
    const url = buildWeatherUrl(45.46421, 9.18997);
    expect(url).toContain('latitude=45.46&'); // arrotondate a ~1 km: niente posizione esatta a terzi
    expect(url).toContain('longitude=9.19&');
    expect(url).toContain('current=temperature_2m,wind_speed_10m,precipitation');
  });

  it('classifica le condizioni con priorità pioggia > vento > temperatura', () => {
    expect(classifyWeather(null)).toBeNull();
    expect(classifyWeather({})).toBeNull();
    expect(classifyWeather({ temperature_2m: 20, wind_speed_10m: 40, precipitation: 2 })).toBe('rain');
    expect(classifyWeather({ temperature_2m: 20, wind_speed_10m: 40, precipitation: 0 })).toBe('wind');
    expect(classifyWeather({ temperature_2m: 1, wind_speed_10m: 5, precipitation: 0 })).toBe('cold');
    expect(classifyWeather({ temperature_2m: 37, wind_speed_10m: 5, precipitation: 0 })).toBe('hot');
    expect(classifyWeather({ temperature_2m: 20, wind_speed_10m: 5, precipitation: 0.1 })).toBe('good');
  });

  it('formatta la temperatura arrotondata', () => {
    expect(formatTemperature({ temperature_2m: 18.6 })).toBe('19°C');
    expect(formatTemperature(null)).toBe('');
  });
});
