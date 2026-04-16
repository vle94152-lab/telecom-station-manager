import { GoogleGenAI } from '@google/genai';
import { Station, ValidationWarning } from '@/src/types';

function getAI() {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY chưa được cấu hình');
  }
  return new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
}

export async function validateStationCoordinatesWithAI(validStations: Partial<Station>[]): Promise<ValidationWarning[]> {
  const ai = getAI();
  const prompt = `Tôi có danh sách các trạm viễn thông sau (Tên, Địa chỉ, Vĩ độ, Kinh độ):
${validStations.map(s => `- ${s.name} | ${s.address} | ${s.latitude}, ${s.longitude}`).join('\n')}

Hãy kiểm tra xem có trạm nào mà tọa độ (vĩ độ, kinh độ) có vẻ bị sai lệch hoàn toàn so với địa chỉ không.
Trả về JSON array theo cấu trúc: name, address, latitude, longitude, issue, recommendation.
Nếu không có trạm nào sai, trả về [] và chỉ trả JSON.`;

  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: prompt,
  });

  const text = response.text?.trim() || '[]';
  const jsonStr = text.replace(/```json/g, '').replace(/```/g, '').trim();
  const parsed = JSON.parse(jsonStr);

  return parsed.map((w: any) => ({
    ...w,
    id: Math.random().toString(36).substring(2, 9),
    isRead: false,
  }));
}

export async function optimizeRouteWithAI(selectedStations: Station[], startLocation: string): Promise<string[]> {
  const ai = getAI();
  const prompt = `Tôi có danh sách các trạm viễn thông sau:
${selectedStations.map(s => `- ID: ${s.id}, Tên: ${s.name}, Tọa độ: ${s.latitude}, ${s.longitude}`).join('\n')}

Vị trí xuất phát của tôi là: ${startLocation || 'Không xác định, hãy tự chọn điểm bắt đầu phù hợp nhất từ danh sách trạm'}.
Hãy sắp xếp thứ tự các trạm này để tạo thành lộ trình ngắn nhất.
Chỉ trả về danh sách ID cách nhau bởi dấu phẩy.`;

  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: prompt,
    config: { tools: [{ googleMaps: {} }] }
  });

  return response.text?.trim().split(',').map(id => id.trim()) || [];
}
