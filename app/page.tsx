"use client";
import { useState, useEffect } from "react";

type agent = {
  name: string,
  coachings: string[],
  sides: string[],
  techs: string[],
  requirement: number,
}

export default function Home() {
  const [agents, setAgents] = useState<agent[]>([]);
  const [hoveredCell, setHoveredCell] = useState<string | null>(null);

  // Load from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem('agents');
    if (saved) {
      setAgents(JSON.parse(saved));
    }
  }, []);

  // Save to localStorage
  function saveData() {
    localStorage.setItem('agents', JSON.stringify(agents));
    alert('Data saved!');
  }

  // Clear localStorage
  function clearData() {
    if (confirm('Are you sure you want to clear all data?')) {
      localStorage.removeItem('agents');
      setAgents([]);
      alert('Data cleared!');
    }
  }

  function addAgent() {
    let agentToAdd = prompt("Add Agent");
    if (agentToAdd != null) {
      setAgents([...agents, {
        name: agentToAdd,
        coachings: [],
        sides: [],
        techs: [],
        requirement: 2
      }]);
    }
  }

  const showAgentScore = (agent: agent) => {
    // let ts = agent.techs.length
    // let cs = agent.coachings.length
    // let ss = agent.sides.length
    // let score = (cs + ss) / agent.requirement + (ts > 0 ? 10 : 0)
  }

  function addCoaching(agentName: string) {
    const date = prompt("Enter date:");
    const notes = prompt("Enter notes:");
    if (date && notes) {
      const updatedAgents = agents.map(agent => 
        agent.name === agentName 
          ? {...agent, coachings: [...agent.coachings, `${date}: ${notes}`]}
          : agent
      );
      setAgents(updatedAgents);
      
      // Show score for the updated agent
      const updatedAgent = updatedAgents.find(a => a.name === agentName);
      if (updatedAgent) showAgentScore(updatedAgent);
    }
  }

  function addSide(agentName: string) {
    const date = prompt("Enter date:");
    const notes = prompt("Enter notes:");
    if (date && notes) {
      const updatedAgents = agents.map(agent => 
        agent.name === agentName 
          ? {...agent, sides: [...agent.sides, `${date}: ${notes}`]}
          : agent
      );
      setAgents(updatedAgents);
      
      // Show score for the updated agent
      const updatedAgent = updatedAgents.find(a => a.name === agentName);
      if (updatedAgent) showAgentScore(updatedAgent);
    }
  }

  function addTech(agentName: string) {
    const score = prompt("Enter score:");
    if (score) {
      const updatedAgents = agents.map(agent => 
        agent.name === agentName 
          ? {...agent, techs: [...agent.techs, `Score: ${score}`]}
          : agent
      );
      setAgents(updatedAgents);
      
      // Show score for the updated agent
      const updatedAgent = updatedAgents.find(a => a.name === agentName);
      if (updatedAgent) showAgentScore(updatedAgent);
    }
  }

  const options = [
    { name: "Add Agent", onClick: () => addAgent() },
    { name: "Save Data", onClick: () => saveData() },
    { name: "Clear Data", onClick: () => clearData() },
    { name: "import BPA report", onClick: () => console.log("importBPA()") }
  ]

  const colorCodes: { [key: number]: string } = {
    0: "#FF0000",
    25: "#770000",
    66: "#888800",
    100: "#007700",
    110: "#0077FF",
  }

  const getScore = (agent: agent): string => {
    let ts = agent.techs.length
    let cs = agent.coachings.length
    let ss = agent.sides.length
    let score = ((cs + ss) / (agent.requirement+1)) * 100 + (ts > 0 ? 10 : 0)
    
    let cc = "#000000"
    Object.keys(colorCodes).forEach((key) => {
      let keyNum = parseInt(key)
      if (score >= keyNum) {
        cc = colorCodes[(keyNum)]
      }
    })
    return cc;
  }

  return (
    <div id="root">
      <style jsx>{`
        table {
          border-collapse: collapse;
          width: 100%;
          text-align: center;
        }
        th, td {
          border: 1px solid gray;
          padding: 0.5rem;
        }
      `}</style>
      <div id="app" style={{ height: '100vh', width: '100vw', display: 'flex', justifyContent: 'start', alignItems: 'start' }}>
        <div id="sidebar" style={{ height: '100%', width: '15%', borderRight: '1px solid gray' }}>
          {(options).map((key) => (
            <div key={key["name"]} style={{ padding: '1rem', cursor: 'pointer', borderBottom: '1px solid gray', borderRadius: '1rem' }} onClick={key["onClick"]}>
              {key["name"]}
            </div>
          ))}
        </div>
        <div style={{ width: "85%" }}>
          <table style={{ width: "100%", textAlign: "center", border: '1px solid gray', borderCollapse: 'collapse' }}>
            <caption>Agents</caption>
            <thead>
              <tr>
                <th>Agent</th>
                <th>Coachings</th>
                <th>Sides</th>
                <th>Techs</th>
                <th>Completion</th>
              </tr>
            </thead>
            <tbody>
              {(agents).map((agent) => (
                <tr key={agent.name} style={{"backgroundColor": getScore(agent)}}>
                  <td>{agent.name}</td>
                  
                  <td 
                    style={{ position: 'relative', cursor: 'help' , backgroundColor: agent.coachings.length > 0 ? '#007700' : ''}}
                    onMouseEnter={() => setHoveredCell(`${agent.name}-coachings`)}
                    onMouseLeave={() => setHoveredCell(null)}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                      <span>{agent.coachings.length}</span>
                      <button 
                        onClick={() => addCoaching(agent.name)}
                        style={{ fontSize: '0.8rem', padding: '0.2rem 0.5rem', cursor: 'pointer' }}
                      >
                        +
                      </button>
                    </div>
                    {hoveredCell === `${agent.name}-coachings` && agent.coachings.length > 0 && (
                      <div style={{
                        position: 'absolute',
                        top: '100%',
                        left: '50%',
                        transform: 'translateX(-50%)',
                        backgroundColor: 'white',
                        border: '1px solid gray',
                        padding: '0.5rem',
                        borderRadius: '0.5rem',
                        zIndex: 10,
                        minWidth: '200px',
                        textAlign: 'left',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                        color:'black',
                      }}>
                        <hr/>
                        {agent.coachings.map((coaching, idx) => (
                          <div key={idx} style={{ marginBottom: '0.25rem' }}>{coaching}<hr/></div>
                        ))}
                      </div>
                    )}
                  </td>

                  <td 
                    style={{ position: 'relative', cursor: 'help' , backgroundColor: agent.sides.length >= agent.requirement ? '#007700' : agent.sides.length > 0 ? '#888800' : '#770000'}}
                    onMouseEnter={() => setHoveredCell(`${agent.name}-sides`)}
                    onMouseLeave={() => setHoveredCell(null)}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                      <span>{agent.sides.length}</span>
                      <button 
                        onClick={() => addSide(agent.name)}
                        style={{ fontSize: '0.8rem', padding: '0.2rem 0.5rem', cursor: 'pointer' }}
                      >
                        +
                      </button>
                    </div>
                    {hoveredCell === `${agent.name}-sides` && agent.sides.length > 0 && (
                      <div style={{
                        position: 'absolute',
                        top: '100%',
                        left: '50%',
                        transform: 'translateX(-50%)',
                        backgroundColor: 'white',
                        border: '1px solid gray',
                        padding: '0.5rem',
                        borderRadius: '0.5rem',
                        zIndex: 10,
                        minWidth: '200px',
                        textAlign: 'left',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                        color:'black',
                      }}>
                        {agent.sides.map((side, idx) => (
                          <div key={idx} style={{ marginBottom: '0.25rem' }}>{side}<hr/></div>
                        ))}
                      </div>
                    )}
                  </td>

                  <td 
                    style={{ position: 'relative', cursor: 'help', backgroundColor: agent.techs.length > 0 ? '#0077ff' : '' }}
                    onMouseEnter={() => setHoveredCell(`${agent.name}-techs`)}
                    onMouseLeave={() => setHoveredCell(null)}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                      <span>{agent.techs.length}</span>
                      <button 
                        onClick={() => addTech(agent.name)}
                        style={{ fontSize: '0.8rem', padding: '0.2rem 0.5rem', cursor: 'pointer' }}
                      >
                        +
                      </button>
                    </div>
                    {hoveredCell === `${agent.name}-techs` && agent.techs.length > 0 && (
                      <div style={{
                        position: 'absolute',
                        top: '100%',
                        left: '50%',
                        transform: 'translateX(-50%)',
                        backgroundColor: 'white',
                        border: '1px solid gray',
                        padding: '0.5rem',
                        borderRadius: '0.5rem',
                        zIndex: 10,
                        minWidth: '200px',
                        textAlign: 'left',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                        color:'black',
                      }}>
                        {agent.techs.map((tech, idx) => (
                          <div key={idx} style={{ marginBottom: '0.25rem' }}>{tech}</div>
                        ))}
                      </div>
                    )}
                  </td>

                  <td>
                    {((agent.coachings.length + agent.sides.length) / (agent.requirement + 1) * 100).toFixed(2)}%
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td>Total</td>
                <td>{agents.reduce((acc, agent) => acc + agent.coachings.length, 0)}</td>
                <td>{agents.reduce((acc, agent) => acc + agent.sides.length, 0)}</td>
                <td>{agents.reduce((acc, agent) => acc + agent.techs.length, 0)}</td>
                <td>{((agents.reduce((acc, agent) => acc + agent.coachings.length + agent.sides.length, 0) / (agents.length +agents.reduce((acc, agent) => acc + agent.requirement, 0))) * 100).toFixed(2)}%</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}