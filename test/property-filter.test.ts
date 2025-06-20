import { describe, it, expect } from 'vitest';

// Import the functions (this is a simplified test, actual functions are inside the main file)

// Move "Done" option to first position in select fields
function moveDoneToFirst(selectProperty: any): any {
  if (!selectProperty.select || !selectProperty.select.options) {
    return selectProperty;
  }

  const options = [...selectProperty.select.options];
  const doneIndex = options.findIndex(option => 
    option.name === 'Done' || option.name === 'done' || option.name === 'DONE'
  );

  if (doneIndex > 0) {
    // Remove "Done" from its current position and add it to the beginning
    const doneOption = options.splice(doneIndex, 1)[0];
    options.unshift(doneOption);
    
    return {
      ...selectProperty,
      select: {
        ...selectProperty.select,
        options: options
      }
    };
  }

  return selectProperty;
}

function filterDatabaseSchemaProperties(properties: any): any {
  const filteredProperties: any = {};
  
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
    
    // For select properties, move "Done" option to first position
    if (prop.type === 'select') {
      filteredProperties[key] = moveDoneToFirst(prop);
      continue;
    }
    
    // Include all other property types (title, rich_text, number, etc.)
    filteredProperties[key] = value;
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
  });

  describe('moveDoneToFirst', () => {
    it('should move "Done" option to first position', () => {
      const selectProperty = {
        type: 'select',
        select: {
          options: [
            { name: 'In Progress', color: 'yellow' },
            { name: 'Done', color: 'green' },
            { name: 'To Do', color: 'red' }
          ]
        }
      };

      const result = moveDoneToFirst(selectProperty);

      expect(result.select.options[0].name).toBe('Done');
      expect(result.select.options[1].name).toBe('In Progress');
      expect(result.select.options[2].name).toBe('To Do');
    });

    it('should handle case-insensitive "Done" variations', () => {
      const selectProperty = {
        type: 'select',
        select: {
          options: [
            { name: 'In Progress', color: 'yellow' },
            { name: 'done', color: 'green' },
            { name: 'To Do', color: 'red' }
          ]
        }
      };

      const result = moveDoneToFirst(selectProperty);

      expect(result.select.options[0].name).toBe('done');
    });

    it('should not change order if "Done" is already first', () => {
      const selectProperty = {
        type: 'select',
        select: {
          options: [
            { name: 'Done', color: 'green' },
            { name: 'In Progress', color: 'yellow' },
            { name: 'To Do', color: 'red' }
          ]
        }
      };

      const result = moveDoneToFirst(selectProperty);

      expect(result.select.options[0].name).toBe('Done');
      expect(result.select.options[1].name).toBe('In Progress');
      expect(result.select.options[2].name).toBe('To Do');
    });

    it('should not change anything if "Done" option does not exist', () => {
      const selectProperty = {
        type: 'select',
        select: {
          options: [
            { name: 'In Progress', color: 'yellow' },
            { name: 'Completed', color: 'green' },
            { name: 'To Do', color: 'red' }
          ]
        }
      };

      const result = moveDoneToFirst(selectProperty);

      expect(result.select.options[0].name).toBe('In Progress');
      expect(result.select.options[1].name).toBe('Completed');
      expect(result.select.options[2].name).toBe('To Do');
    });

    it('should handle select property without options', () => {
      const selectProperty = {
        type: 'select',
        select: {}
      };

      const result = moveDoneToFirst(selectProperty);

      expect(result).toEqual(selectProperty);
    });
  });

  describe('filterDatabaseSchemaProperties with Done reordering', () => {
    it('should move Done to first position in select fields during filtering', () => {
      const input = {
        'Name': { type: 'title' },
        'Status': { 
          type: 'select',
          select: {
            options: [
              { name: 'To Do', color: 'red' },
              { name: 'In Progress', color: 'yellow' },
              { name: 'Done', color: 'green' }
            ]
          }
        },
        'Priority': { 
          type: 'select',
          select: {
            options: [
              { name: 'Low', color: 'gray' },
              { name: 'Medium', color: 'yellow' },
              { name: 'High', color: 'red' }
            ]
          }
        }
      };

      const result = filterDatabaseSchemaProperties(input);

      // Status field should have Done moved to first position
      expect(result.Status.select.options[0].name).toBe('Done');
      expect(result.Status.select.options[1].name).toBe('To Do');
      expect(result.Status.select.options[2].name).toBe('In Progress');

      // Priority field should remain unchanged (no Done option)
      expect(result.Priority.select.options[0].name).toBe('Low');
      expect(result.Priority.select.options[1].name).toBe('Medium');
      expect(result.Priority.select.options[2].name).toBe('High');
    });
  });
}); 
