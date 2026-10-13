/** @fileoverview Read-only outage reconstruction tests for simultaneous states and gaps. */
import {describe,it,expect,vi} from "vitest";
import {loadOutageHistory} from "../src/outage-history.js";
describe("outage Recorder coverage",()=>{
  it("never sends an empty or duplicate entity filter to Recorder",async()=>{
    const hass={callApi:vi.fn()};
    await expect(loadOutageHistory(hass,{grid_connected:"",freshness:""},1000)).rejects.toThrow();
    await expect(loadOutageHistory(hass,{grid_connected:"same",freshness:"same"},1000)).rejects.toThrow();
    expect(hass.callApi).not.toHaveBeenCalled();
  });
  it("requires fresh coverage and labels interruption instead of inventing restoration",async()=>{
    const row=(id,time,state)=>({entity_id:id,last_changed:new Date(time).toISOString(),state});
    const hass={callApi:vi.fn(async()=>[[row("grid",100,"on"),row("grid",200,"off"),row("grid",400,"on")],[row("fresh",100,"on"),row("fresh",300,"off")]])};
    const result=await loadOutageHistory(hass,{grid_connected:"grid",freshness:"fresh"},1000);
    expect(result.events).toEqual([{start:200,end:300,partial:true}]);expect(hass.callApi.mock.calls[0][0]).toBe("get");
  });
  it("does not turn absent history into proven grid availability",async()=>{
    const result=await loadOutageHistory({callApi:async()=>[]},{grid_connected:"g",freshness:"f"},1000);
    expect(result.events).toEqual([]);expect(result.coverage).toBe("No Recorder coverage");
    await expect(loadOutageHistory({callApi:async()=>null},{grid_connected:"g",freshness:"f"},1000)).rejects.toThrow();
  });
});
