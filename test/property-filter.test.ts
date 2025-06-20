import { describe, it, expect } from 'vitest';

// Configuration for property prefixes used for alphabetical sorting
const PROPERTY_PREFIXES = {
  'Done': '1. ',
  'Last Edited By': 'z. '
} as const;

// Helper functions for property name transformations
function getPrefixedName(originalName: string): string {
  const prefix = PROPERTY_PREFIXES[originalName as keyof typeof PROPERTY_PREFIXES];
  return prefix ? `${prefix}${originalName}` : originalName;
}

function shouldRenameProperty(propertyName: string): boolean {
  return propertyName in PROPERTY_PREFIXES;
}

// Import the functions (this is a simplified test, actual functions are inside the main file)
function filterDatabaseSchemaProperties(properties: any): any {
  const filteredProperties: any = {};
  const renamedProperties: { [key: string]: any } = {};
  
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
    
    // If this property should be renamed with prefix, save it for later
    if (shouldRenameProperty(key)) {
      const prefixedName = getPrefixedName(key);
      renamedProperties[prefixedName] = value;
      continue;
    }
    
    // Include all other property types (title, rich_text, number, etc.)
    filteredProperties[key] = value;
  }
  
  // Add renamed properties at the beginning for proper sorting
  const reorderedProperties = { ...renamedProperties, ...filteredProperties };
  
  // Add Last Edited By field with prefix for alphabetical sorting (to be last)
  const lastEditedByFieldName = getPrefixedName('Last Edited By');
  reorderedProperties[lastEditedByFieldName] = {
    type: 'last_edited_by',
    last_edited_by: {}
  };
  
  return reorderedProperties;
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
    
    // Rename properties with prefixes for alphabetical sorting in target database
    if (shouldRenameProperty(key)) {
      const prefixedName = getPrefixedName(key);
      filteredProperties[prefixedName] = value;
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
      const lastEditedByFieldName = getPrefixedName('Last Edited By');

      expect(result).toEqual({
        'Name': { type: 'title' },
        'Status': { type: 'select' },
        [lastEditedByFieldName]: { type: 'last_edited_by', last_edited_by: {} }
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
      const lastEditedByFieldName = getPrefixedName('Last Edited By');

      const expected = {
        ...input,
        [lastEditedByFieldName]: { type: 'last_edited_by', last_edited_by: {} }
      };
      expect(result).toEqual(expected);
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

    it('should rename configured properties for page creation', () => {
      const input = {
        'Name': { type: 'title', title: [{ text: { content: 'Test' } }] },
        'Done': { type: 'checkbox', checkbox: true },
        'Status': { type: 'select', select: { name: 'In Progress' } }
      };

      const result = filterPropertiesForCreation(input);
      const donePrefixedName = getPrefixedName('Done');

      expect(result).toEqual({
        'Name': { type: 'title', title: [{ text: { content: 'Test' } }] },
        [donePrefixedName]: { type: 'checkbox', checkbox: true },
        'Status': { type: 'select', select: { name: 'In Progress' } }
      });
      expect(result).not.toHaveProperty('Done'); // Original key should be replaced
    });
  });

  describe('Property positioning with configuration', () => {
    it('should rename configured properties and place them in correct positions', () => {
      const input = {
        'Name': { type: 'title' },
        'Status': { type: 'select' },
        'Done': { type: 'checkbox' },
        'Priority': { type: 'select' }
      };

      const result = filterDatabaseSchemaProperties(input);
      const keys = Object.keys(result);
      const donePrefixedName = getPrefixedName('Done');
      const lastEditedByFieldName = getPrefixedName('Last Edited By');

      expect(keys[0]).toBe(donePrefixedName);
      expect(keys).toContain('Name');
      expect(keys).toContain('Status');
      expect(keys).toContain('Priority');
      expect(keys).toContain(lastEditedByFieldName);
      expect(keys).not.toContain('Done'); // Original key should be replaced
      expect(keys[keys.length - 1]).toBe(lastEditedByFieldName); // Should be last
    });

    it('should handle schema without configured properties', () => {
      const input = {
        'Name': { type: 'title' },
        'Status': { type: 'select' },
        'Priority': { type: 'select' }
      };

      const result = filterDatabaseSchemaProperties(input);
      const lastEditedByFieldName = getPrefixedName('Last Edited By');

      const expected = {
        ...input,
        [lastEditedByFieldName]: { type: 'last_edited_by', last_edited_by: {} }
      };
      expect(result).toEqual(expected);
    });

    it('should handle different types of configured properties', () => {
      const input = {
        'Name': { type: 'title' },
        'Done': { type: 'select', select: { options: [{ name: 'Yes' }, { name: 'No' }] } },
        'Status': { type: 'select' }
      };

      const result = filterDatabaseSchemaProperties(input);
      const keys = Object.keys(result);
      const donePrefixedName = getPrefixedName('Done');

      expect(keys[0]).toBe(donePrefixedName);
      expect(result[donePrefixedName].type).toBe('select');
      expect(keys).not.toContain('Done'); // Original key should be replaced
    });

    it('should add Last Edited By field with proper prefix', () => {
      const input = {
        'Name': { type: 'title' },
        'Status': { type: 'select' },
        'Done': { type: 'checkbox' }
      };

      const result = filterDatabaseSchemaProperties(input);
      const keys = Object.keys(result);
      const lastEditedByFieldName = getPrefixedName('Last Edited By');

      expect(keys).toContain(lastEditedByFieldName);
      expect(result[lastEditedByFieldName].type).toBe('last_edited_by');
      expect(keys[keys.length - 1]).toBe(lastEditedByFieldName); // Should be last
    });

    it('should add Last Edited By field even without other configured properties', () => {
      const input = {
        'Name': { type: 'title' },
        'Status': { type: 'select' },
        'Priority': { type: 'select' }
      };

      const result = filterDatabaseSchemaProperties(input);
      const lastEditedByFieldName = getPrefixedName('Last Edited By');

      expect(result).toHaveProperty(lastEditedByFieldName);
      expect(result[lastEditedByFieldName].type).toBe('last_edited_by');
    });
  });

  describe('Helper functions', () => {
    it('should getPrefixedName correctly', () => {
      expect(getPrefixedName('Done')).toBe('1. Done');
      expect(getPrefixedName('Last Edited By')).toBe('z. Last Edited By');
      expect(getPrefixedName('Other Property')).toBe('Other Property');
    });

    it('should shouldRenameProperty correctly', () => {
      expect(shouldRenameProperty('Done')).toBe(true);
      expect(shouldRenameProperty('Last Edited By')).toBe(true);
      expect(shouldRenameProperty('Other Property')).toBe(false);
    });
  });
}); 
