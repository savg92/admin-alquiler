import type { INestApplication } from "@nestjs/common";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";

export function setupOpenApi(app: INestApplication): void {
  const config = new DocumentBuilder()
    .setTitle("Admin alquiler API")
    .setDescription("Property and rental administration platform (Colombia first, es-CO).")
    .setVersion("1")
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  app
    .getHttpAdapter()
    .get("/openapi.json", (_req: unknown, res: { json: (d: unknown) => void }) => {
      res.json(document);
    });
  SwaggerModule.setup("docs", app, document);
}
