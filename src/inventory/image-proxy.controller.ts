import { Controller, Get, Req, Res, Logger, HttpException, HttpStatus } from '@nestjs/common';
import type { Request, Response } from 'express';
import axios from 'axios';

@Controller('image-proxy')
export class ImageProxyController {
  private readonly logger = new Logger(ImageProxyController.name);

  /**
   * Proxy endpoint for Steam images to bypass CORS
   * Usage: /image-proxy/:encodedImagePath
   * Example: /image-proxy/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSROWqmu7LAocGIGz3UqIXOLrxM-vM
   */
  @Get('*')
  async proxyImage(@Req() req: Request, @Res() res: Response) {
    try {
      // Extract image path from URL
      // URL format: /image-proxy/{imagePath}
      const urlPath = req.url;
      const imagePathMatch = urlPath.match(/^\/image-proxy\/(.+)$/);
      
      if (!imagePathMatch || !imagePathMatch[1]) {
        this.logger.error(`Invalid image path in URL: ${urlPath}`);
        throw new HttpException('Image path is required', HttpStatus.BAD_REQUEST);
      }

      // Decode the image path (it might be URL encoded)
      const decodedPath = decodeURIComponent(imagePathMatch[1]);
      
      this.logger.debug(`Proxying image: ${decodedPath}`);
      
      // Try multiple CDN options
      const cdnUrls = [
        `https://community.fastly.steamstatic.com/economy/image/${decodedPath}`,
        `https://community.cloudflare.steamstatic.com/economy/image/${decodedPath}`,
        `https://steamcommunity-a.akamaihd.net/economy/image/${decodedPath}`,
      ];

      let imageData: Buffer | null = null;
      let contentType = 'image/png';

      // Try each CDN until one works
      for (const url of cdnUrls) {
        try {
          this.logger.debug(`Trying to fetch image from: ${url}`);
          const response = await axios.get(url, {
            responseType: 'arraybuffer',
            timeout: 10000,
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8',
              'Referer': 'https://steamcommunity.com/',
            },
            validateStatus: (status) => status < 500,
          });

          if (response.status === 200 && response.data) {
            imageData = Buffer.from(response.data);
            contentType = response.headers['content-type'] || 'image/png';
            this.logger.debug(`Successfully fetched image from: ${url}`);
            break;
          }
        } catch (error: any) {
          this.logger.debug(`Failed to fetch from ${url}: ${error.message}`);
          continue;
        }
      }

      if (!imageData) {
        throw new HttpException('Failed to fetch image from all CDN sources', HttpStatus.NOT_FOUND);
      }

      // Set CORS headers to allow Flutter Web to load the image
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'public, max-age=86400'); // Cache for 24 hours
      
      res.send(imageData);
    } catch (error: any) {
      this.logger.error(`Error proxying image: ${error.message}`);
      
      if (error instanceof HttpException) {
        throw error;
      }
      
      throw new HttpException(
        `Failed to proxy image: ${error.message || 'Unknown error'}`,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }
}

