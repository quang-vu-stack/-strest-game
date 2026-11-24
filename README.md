# Hiên Mưa

Game 3D đi dạo trong khu vườn bên hồ. Men theo đường sỏi, qua cầu gỗ và tưới những chậu cây để hoa nở. Bạn có thể dừng ở bất cứ đâu. Game chạy trong trình duyệt với Three.js.

## Chạy trên máy

Cài Node.js 22 LTS (từ 22.12) hoặc mới hơn, rồi chạy trong thư mục dự án:

```sh
npm ci
npm run dev
```

Mở địa chỉ Vite in ra. Kiểm tra bản build với `npm run build` và xem bản build trên máy với `npm run preview`.

## Điều khiển

- **WASD hoặc phím mũi tên** để đi, **E** hoặc **Tưới cây** khi gần chậu.
- **Chạm hoặc bấm xuống đất** để đi theo đoạn thẳng ngắn. Khi gặp hồ hoặc nhà, chọn một điểm trung gian.
- Nút **Mưa** bật/tắt mưa và ô. **Ít chuyển động** ẩn mưa rơi, gợn nước và cho hoa hiện ngay. Game dùng thiết lập giảm chuyển động của thiết bị lúc mở.

## Phân công

| Người thực hiện | Phần việc |
| --- | --- |
| Codex | Cảnh 3D, điều khiển, tưới hoa, giao diện và kiểm tra tích hợp |
| Gemini | Âm thanh nền trong `src/ambient-audio.js`. [Yêu cầu và tiêu chí bàn giao](https://github.com/quang-vu-stack/-strest-game/issues/1) |

Bản 0.1 tập trung vào dạo vườn và tưới hoa. Tiếng mưa đang chờ phần bàn giao của Gemini.
