import { describe, it, expect } from 'vitest';

// Import the functions (this is a simplified test, actual functions are inside the main file)

function filterDatabaseSchemaProperties(properties: any): any {
  const filteredProperties: any = {};
  let doneProperty: any = null;
  let donePropertyKey = '';
  
  for (const [key, value] of Object.entries(properties)) {
    const prop = value as any;
    
    // Skip relation properties as they reference other databases and can cause validation errors
    if (prop.type === 'relation') {
      console.log(`Skipping relation property in schema: ${key}`);
      continue;
    }
    
    // Skip rollup properties as they depend on relations
    if (prop.type === 'rollup') {
      console.log(`Skipping rollup property in schema: ${key}`);
      continue;
    }
    
    // If this is the "Done" property, save it for later with "1. " prefix
    if (key === 'Done') {
      doneProperty = value;
      donePropertyKey = '1. Done';
      continue;
    }
    
    // Include all other property types (title, rich_text, number, etc.)
    filteredProperties[key] = value;
  }
  
  // Add "Done" property at the beginning if it exists
  if (doneProperty && donePropertyKey) {
    return { [donePropertyKey]: doneProperty, ...filteredProperties };
  }
  
  return filteredProperties;
}

function filterPropertiesForCreation(properties: any): any {
  const filteredProperties: any = {};
  
  for (const [key, value] of Object.entries(properties)) {
    const prop = value as any;
    
    // Skip relation properties
    if (prop.type === 'relation') {
      continue;
    }
    
    // Skip rollup properties
    if (prop.type === 'rollup') {
      continue;
    }
    
    // Skip formula properties
    if (prop.type === 'formula') {
      continue;
    }
    
    // Skip system properties
    if (prop.type === 'created_by' || prop.type === 'last_edited_by') {
      continue;
    }
    
    if (prop.type === 'created_time' || prop.type === 'last_edited_time') {
      continue;
    }
    
    // Rename "Done" property to "1. Done" for alphabetical sorting in target database
    if (key === 'Done') {
      filteredProperties['1. Done'] = value;
      continue;
    }
    
    filteredProperties[key] = value;
  }
  
  return filteredProperties;
}

describe('Property Filtering', () => {
  describe('filterDatabaseSchemaProperties', () => {
    it('should filter out relation properties', () => {
      const input = {
        'Name': { type: 'title' },
        'Related Items': { type: 'relation', relation: { database_id: 'some-id' } },
        'Status': { type: 'select' },
        'Count': { type: 'rollup' }
      };

      const result = filterDatabaseSchemaProperties(input);

      expect(result).toEqual({
        'Name': { type: 'title' },
        'Status': { type: 'select' }
      });
    });

    it('should keep all other property types', () => {
      const input = {
        'Title': { type: 'title' },
        'Description': { type: 'rich_text' },
        'Priority': { type: 'select' },
        'Due Date': { type: 'date' },
        'Completed': { type: 'checkbox' },
        'Price': { type: 'number' }
      };

      const result = filterDatabaseSchemaProperties(input);

      expect(result).toEqual(input);
    });
  });

  describe('filterPropertiesForCreation', () => {
    it('should filter out problematic properties for page creation', () => {
      const input = {
        'Name': { type: 'title', title: [{ text: { content: 'Test' } }] },
        'Related Items': { type: 'relation', relation: [{ id: 'page-id' }] },
        'Status': { type: 'select', select: { name: 'In Progress' } },
        'Total Count': { type: 'rollup', rollup: { number: 5 } },
        'Auto Calc': { type: 'formula', formula: { string: 'computed' } },
        'Created By': { type: 'created_by', created_by: { id: 'user-id' } },
        'Last Edited': { type: 'last_edited_time', last_edited_time: '2023-01-01T00:00:00.000Z' }
      };

      const result = filterPropertiesForCreation(input);

      expect(result).toEqual({
        'Name': { type: 'title', title: [{ text: { content: 'Test' } }] },
        'Status': { type: 'select', select: { name: 'In Progress' } }
      });
    });

    it('should handle empty properties object', () => {
      const result = filterPropertiesForCreation({});
      expect(result).toEqual({});
    });

    it('should rename "Done" property to "1. Done" in page creation', () => {
      const input = {
        'Name': { type: 'title', title: [{ text: { content: 'Test' } }] },
        'Done': { type: 'checkbox', checkbox: true },
        'Status': { type: 'select', select: { name: 'In Progress' } }
      };

      const result = filterPropertiesForCreation(input);

      expect(result).toEqual({
        'Name': { type: 'title', title: [{ text: { content: 'Test' } }] },
        '1. Done': { type: 'checkbox', checkbox: true },
        'Status': { type: 'select', select: { name: 'In Progress' } }
      });
      expect(result).not.toHaveProperty('Done'); // Original key should be replaced
    });
  });

  describe('Done property positioning', () => {
    it('should rename "Done" property to "1. Done" and place at first position', () => {
      const input = {
        'Name': { type: 'title' },
        'Status': { type: 'select' },
        'Done': { type: 'checkbox' },
        'Priority': { type: 'select' }
      };

      const result = filterDatabaseSchemaProperties(input);
      const keys = Object.keys(result);

      expect(keys[0]).toBe('1. Done');
      expect(keys).toContain('Name');
      expect(keys).toContain('Status');
      expect(keys).toContain('Priority');
      expect(keys).not.toContain('Done'); // Original key should be replaced
    });

    it('should handle schema without "Done" property', () => {
      const input = {
        'Name': { type: 'title' },
        'Status': { type: 'select' },
        'Priority': { type: 'select' }
      };

      const result = filterDatabaseSchemaProperties(input);

      expect(result).toEqual(input);
    });

    it('should handle different types of "Done" property', () => {
      const input = {
        'Name': { type: 'title' },
        'Done': { type: 'select', select: { options: [{ name: 'Yes' }, { name: 'No' }] } },
        'Status': { type: 'select' }
      };

      const result = filterDatabaseSchemaProperties(input);
      const keys = Object.keys(result);

      expect(keys[0]).toBe('1. Done');
      expect(result['1. Done'].type).toBe('select');
      expect(keys).not.toContain('Done'); // Original key should be replaced
    });
  });


}); 
