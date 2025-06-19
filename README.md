# 🗂️ Notion Database Cloner

A serverless application that allows you to clone Notion databases with a simple web interface. Built with TypeScript and deployed on Vercel.

## ✨ Features

- **🔄 Database Cloning**: Clone any Notion database structure AND content to a new location
- **🌐 Web Interface**: Easy-to-use web form for inputting database and page IDs
- **⚡ Serverless**: Fast and scalable, deployed on Vercel
- **🔒 Secure**: Uses your Notion integration token for secure API access
- **📱 Responsive**: Works on desktop and mobile devices
- **🧪 Tested**: Comprehensive test suite with 100% passing tests

## 🚀 Quick Start

### Prerequisites

- Notion account with API access
- Vercel account for deployment

### Setup

1. **Clone the repository**

   ```bash
   git clone <repository-url>
   cd notion-integration
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Configure environment variables**

   Create a `.env.local` file:

   ```bash
   NOTION_TOKEN=your_notion_integration_token
   ```

   To get your Notion token:
   - Go to [Notion Developers](https://developers.notion.com/)
   - Create a new integration
   - Copy the integration token
   - Share your databases and pages with the integration

4. **Run locally**

   ```bash
   npm run dev
   ```

5. **Deploy to Vercel**

   ```bash
   npm run deploy
   ```

## 📖 How to Use

### Web Interface

1. Open the application in your browser
2. Enter the **Source Database ID** - the ID of the database you want to clone
3. Enter the **Parent Page ID** - the ID of the page where the new database will be created
4. Optionally enter a **New Database Name**
5. Click "Clone Database"

### Finding IDs

To find a Notion database or page ID:

1. Open the database/page in Notion
2. Copy the URL
3. Extract the 32-character ID from the URL

Example URL: `https://notion.so/workspace/12345678901234567890123456789012?v=...`
The ID is: `12345678901234567890123456789012`

### API Endpoints

#### Health Check

```bash
GET /api/health
```

Response:

```json
{
  "status": "healthy",
  "timestamp": "2023-12-07T10:30:00.000Z",
  "version": "2.0.0",
  "hasToken": true
}
```

#### Clone Database

```bash
POST /api/duplicate
Content-Type: application/json

{
  "sourceDatabaseId": "12345678901234567890123456789012",
  "parentPageId": "12345678901234567890123456789012",
  "newName": "My Database Copy"
}
```

Response:

```json
{
  "success": true,
  "newDatabaseId": "98765432109876543210987654321098",
  "newDatabaseUrl": "https://notion.so/98765432109876543210987654321098",
  "message": "Database \"My Database Copy\" successfully cloned with 15 pages!",
  "copiedPagesCount": 15
}
```

## 🧪 Testing

Run the test suite:

```bash
npm test
```

Run tests with verbose output:

```bash
npm test -- --reporter=verbose
```

## 🛠️ Development

### Project Structure

```
.
├── api/                    # Serverless functions
│   ├── duplicate.ts       # Main cloning function
│   └── health.ts          # Health check endpoint
├── test/                   # Test files
│   └── api.test.ts        # API unit tests
├── public/                 # Frontend
│   └── index.html         # Web interface
├── package.json           # Dependencies and scripts
├── tsconfig.json          # TypeScript configuration
├── vitest.config.ts       # Test configuration
└── vercel.json            # Deployment configuration
```

### Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build TypeScript files
- `npm test` - Run test suite
- `npm run lint` - Run linter
- `npm run lint:fix` - Fix linting issues
- `npm run deploy` - Deploy to Vercel

### Code Quality

This project uses:

- **TypeScript** for type safety
- **Biome** for linting and formatting
- **Vitest** for testing
- **ESM modules** for modern JavaScript

## 🔧 Configuration

### Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `NOTION_TOKEN` | Your Notion integration token | Yes |

### Vercel Configuration

The `vercel.json` file configures:

- Function regions and runtime
- Environment variable exposure
- Build settings

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests: `npm test`
5. Run linter: `npm run lint`
6. Submit a pull request

## 📝 License

This project is open source and available under the [MIT License](LICENSE).

## 🆘 Troubleshooting

### Common Issues

**"Unauthorized" Error**

- Check that your `NOTION_TOKEN` is correct
- Ensure the integration has access to both source database and target page

**"Not Found" Error**

- Verify the database and page IDs are correct
- Check that the integration has proper permissions

**"Invalid ID Format" Error**

- Ensure IDs are 32 characters long
- Remove any dashes from the ID

### Support

If you encounter issues:

1. Check the console for error messages
2. Verify your Notion integration permissions
3. Test with the health endpoint: `/api/health`
4. Review the test suite for examples

## 🎯 Roadmap

- [x] Support for copying database content (pages) ✅
- [ ] Batch operations for multiple databases
- [ ] Copy database page content (rich text blocks)
- [ ] Database comparison tools
- [ ] Export/import functionality
- [ ] Advanced filtering options

---

Made with ❤️ for the Notion community
